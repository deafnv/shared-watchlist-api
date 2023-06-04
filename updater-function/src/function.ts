import http from 'http'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import { google, sheets_v4 } from 'googleapis'
import { PostgrestResponse, createClient } from '@supabase/supabase-js'
import { Completed, Prisma, PrismaClient } from '@prisma/client'
import isEmpty from 'lodash/isEmpty.js'
import xorWith from 'lodash/xorWith.js'
import differenceWith from 'lodash/differenceWith.js'
import isEqual from 'lodash/isEqual.js'
import uniq from 'lodash/uniq.js'
import flatten from 'lodash/flatten.js'

import { PTWRolled, PTWTable, Seasonal } from './types.js'

dotenv.config()

const app = express()

app.use(
  cors({origin: ['http://localhost:3000', 'http://127.0.0.1:3000'].concat(process.env.CORS_URL.split(','))})
)

app.get('/', (req, res) => {
  res.send(isFunctionRunning)
})

app.get('/stop', (req, res) => {
  if (isFunctionRunning) {
    isFunctionRunning = false
    res.send('Function stopped')
  } else res.send('Function already stopped')
})

app.get('/start', (req, res) => {
  if (!isFunctionRunning) {
    isFunctionRunning = true
    res.send('Function started')
  } else res.send('Function already started')
})

app.get('/flush', async (req, res) => {
  try {
    await updateDatabase()
    res.send('Function invoked')
  } catch (error) {
    console.error(error)
  }
})

app.get('/refresh', (req, res) => {
  timer = new Date().getTime()
  res.send('Timer refreshed')
})

app.get('/timer', (req, res) => {
  res.send(new Date(timer))
})

const httpServer = http.createServer(app)
httpServer.listen(3004, () => {
  console.log('HTTP Server running on port 3004')
})

const auth = await google.auth.getClient({ credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY)
const prisma = new PrismaClient()

let isFunctionRunning = true
//* Timer is reset by /refresh and only syncs the database and sheet if the time since last refresh is less than TIME_LIMIT
let timer = new Date().getTime()
const TIME_LIMIT = 1800000 //? 30 minutes

const updateDatabase = async () => {
  if (isFunctionRunning && new Date().getTime() - timer < TIME_LIMIT) {
    /* console.time('timer') */
    
    const resCompleted = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `Sheet1!A2:J999`,
      fields: 'values'
    })
    
    //TODO: Fix the timestamp here for sorting client side, alternatively could sort using JS's convert string to date function.
    const objectifiedResCompleted = resCompleted.data.values?.map(item => {
      let fixed = new Array(10)
      fixed.fill(null)
      Object.seal(fixed)
      let [id, title, type, episode, rating1, rating2, rating3, start, end, notes] = item
      fixed = [id, title, type, episode, rating1, rating2, rating3, start, end, notes]

      const startconv = new Date(fixed[7])
      const endconv = new Date(fixed[8])
      const episodeOriginal: string = fixed[3] ?? ''
      const episodeSplit = episodeOriginal.split('/')
      const episodeActual = episodeSplit[0] ? parseInt(episodeSplit[0]) : -1
      const episodeTotal = episodeSplit[1] ? parseInt(episodeSplit[1]) : -1
      const typeOriginal: string = fixed[2] ?? ''
      const typeSplit = typeOriginal.split('+')
      const typeConv = typeSplit.map(item => item.replace(/\s+/g, ''))
      return {
        id: parseInt(fixed[0]), 
        title: fixed[1] ?? '',
        type: fixed[2] ?? '',
        type_conv: typeConv,
        episode: episodeOriginal,
        episode_actual: episodeActual ? episodeActual : 0,
        episode_total: episodeTotal ? episodeTotal : 0,
        rating1: fixed[4] ?? '',
        rating2: fixed[5] ?? '',
        rating3: fixed[6] ?? '',
        start: fixed[7] ?? '',
        startconv: isNaN(startconv.getTime()) ? 0 : startconv.getTime(),
        end: fixed[8] ?? '',
        endconv: isNaN(endconv.getTime()) ? 0 : endconv.getTime(),
        rating1average: fixed[4] ? getAverage(fixed[4]) : 0,
        rating2average: fixed[5] ? getAverage(fixed[5]) : 0,
        rating3average: fixed[6] ? getAverage(fixed[6]) : 0,
        notes: fixed[9] ?? ''
      }
    })
    
    const dataCompletedRaw = await prisma.completed.findMany({
      orderBy: {
        id: 'asc'
      }
    })

    //* Remove updatedAt and createdAt fields
    const dataCompleted = dataCompletedRaw.map(dataCompletedRawItem => {
      const a = exclude(dataCompletedRawItem, ['createdAt', 'updatedAt'])
      return {
        ...a,
        startconv: Number(a.startconv),
        endconv: Number(a.endconv)
      }
    })

    const differenceCompleted = uniq(xorWith(objectifiedResCompleted, dataCompleted, isEqual).map(item => {
      return item.id
    }))
    
    if (differenceCompleted.length > 0) {
      const differenceCompletedFromSheet = flatten(differenceCompleted.map(item => {
        return objectifiedResCompleted.filter(title => {
          return title.id === item
        })
      }))
      console.log(differenceCompletedFromSheet[0].title)

      //? Accounting for deletes
      if (dataCompleted.length > objectifiedResCompleted.length) {
        const deletedCompletedIds = differenceWith(dataCompleted, objectifiedResCompleted, isEqual).map(item => {
          return item.id
        })
        /* const responseDelete =  */await prisma.completed.deleteMany({
          where: {
            id: {
              in: deletedCompletedIds
            }
          }
        })
      }
      const responseUpsert = await prisma.$transaction(
        differenceCompletedFromSheet.map(differenceCompletedFromSheetItem => {
          return prisma.completed.upsert({
            create: differenceCompletedFromSheetItem,
            update: differenceCompletedFromSheetItem,
            where: {
              id: differenceCompletedFromSheetItem.id
            }
          })
        })
      )
    }

    //console.log(objectifiedResCompleted[37])
    //* If using differenceWith, do both ways.
    //console.log(differenceWith(objectifiedResCompleted, dataCompleted.data, isEqual))
    ///console.log(differenceWith(dataCompleted.data, objectifiedResCompleted, isEqual))

    //* This xorWith shows both differences in one array, kinda hard to separate
    //console.log(xorWith(objectifiedResCompleted, dataCompleted.data, isEqual))
    
    //? Right side of sheet
    /* const resRight = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SHEET_ID,
      ranges: ['L2:R45'],
      fields: 'sheets/data/rowData/values(formattedValue,userEnteredFormat/backgroundColor)'
    })

    const dataCasual = await supabase 
      .from('PTW-Casual')
      .select()
      .order('id', { ascending: true })
    const dataMovies = await supabase 
      .from('PTW-Movies')
      .select()
      .order('id', { ascending: true })
    const dataNonCasual = await supabase 
      .from('PTW-NonCasual')
      .select()
      .order('id', { ascending: true })
    const dataRolled = await supabase 
      .from('PTW-Rolled')
      .select()
      .order('id', { ascending: true })
    const dataSeasonal = await supabase 
      .from('PTW-CurrentSeason')
      .select()
      .order('order', { ascending: true })
    
    let casual: PTWTable[] = []
    let movies: PTWTable[] = []
    let nonCasual: PTWTable[] = []
    let ptwInOrder: PTWRolled[] = []
    let currentSeason: Seasonal[] = []
    
    resRight.data.sheets[0].data[0].rowData.forEach((item, index) => {
      if (index < 15 && item.values[0].formattedValue) {
        casual.push({
          id: index,
          title: item.values[0].formattedValue
        })
      } else if (index > 19 && index <= 24 && item.values[0].formattedValue) {
        movies.push({
          id: index - 20,
          title: item.values[0].formattedValue
        })
      }
      if (index < 15 && item.values[1].formattedValue) nonCasual.push({id: index, title: item.values[1].formattedValue})
      if (index < 21 && item.values[2].formattedValue) ptwInOrder.push({
        id: index, 
        title: item.values[2].formattedValue,
        status: determineState(item.values[2]?.userEnteredFormat.backgroundColor)
      })
      if (index < 21 && item.values[3]?.formattedValue) currentSeason.push(
        {
          title: item.values[3].formattedValue,
          status: determineState(item.values[4]?.userEnteredFormat.backgroundColor),
          order: index
        }
      )
    })

    commitDifference(casual, dataCasual, 'PTW-Casual')
    commitDifference(movies, dataMovies, 'PTW-Movies')
    commitDifference(nonCasual, dataNonCasual, 'PTW-NonCasual')
    commitDifference(ptwInOrder, dataRolled, 'PTW-Rolled')
    commitDifferenceSeasonal(currentSeason, dataSeasonal, 'PTW-CurrentSeason') */
    
    /* console.timeEnd('timer') */
  }
}

setInterval(updateDatabase, 3000)

async function commitDifferenceSeasonal(sheetValues: any[], dataFromDB: PostgrestResponse<any>, tableName: string) {
  //!Account for transposition/deletes
  if (dataFromDB.data?.length > sheetValues.length) {
    const removedOrderDB = dataFromDB.data.map(item => ({
      title: item.title,
      status: item.status
    }))
    const removedOrderSheet = sheetValues.map(item => ({
      title: item.title,
      status: item.status
    }))
    const missingItem = uniq(xorWith(removedOrderSheet, removedOrderDB, isEqual).map(item => {
      return item.title
    }))
    
    const responseDelete = await supabase
        .from(tableName)
        .delete()
        .in('title', missingItem)
  }

  const difference = uniq(xorWith(sheetValues, dataFromDB.data, isEqual).map(item => {
    return item.title
  }))
  if (difference?.length > 0) {
    const differenceFromSheet = flatten(difference.map(item => {
      return sheetValues.filter(title => {
        return title.title === item
      })
    }))

    const responseUpsert = await supabase
      .from(tableName)
      .upsert(differenceFromSheet)
  }
}

//TODO: Improve this commitDifference function to reflect the more efficient commitDifference above
async function commitDifference(sheetValues: any[], dataFromDB: PostgrestResponse<any>, tableName: string) {
  const difference = uniq(xorWith(sheetValues, dataFromDB.data, isEqual).map(item => {
    return item.id
  }))
  if (difference?.length > 0) {
    const differenceFromSheet = flatten(difference.map(item => {
      return sheetValues.filter(title => {
        return title.id === item
      })
    }))

    //? Accounting for deletes
    if (dataFromDB.data.length > sheetValues.length) {
      const deletedIds = differenceWith(dataFromDB.data, sheetValues, isEqual).map(item => {
        return item.id
      })
      /* const responseDelete =  */await supabase
        .from(tableName)
        .delete()
        .in('id', deletedIds)
    }
    /* const responseUpsert =  */await supabase
      .from(tableName)
      .upsert(differenceFromSheet)
  }
}

function determineState(backgroundColor: sheets_v4.Schema$Color) {
  const red = backgroundColor?.red
  const green = backgroundColor?.green
  const blue = backgroundColor?.blue
  let status
  if ((0.20 < red && 0.21 > red) && (0.65 < green && 0.66 > green) && (0.32 < blue && 0.33 > blue)) {
    //? Watched
    status = 'Watched'
  }
  else if ((0.91 < red && 0.92 > red) && (0.26 < green && 0.27 > green) && (0.20 < blue && 0.21 > blue)) {
    //? Not loaded
    status = 'Not loaded'
  }
  else if ((0.98 < red && 0.99 > red) && (0.73 < green && 0.74 > green) && (0.01 < blue && 0.02 > blue)) {
    //? Loaded
    status = 'Loaded'
  }
  else if (isEmpty(backgroundColor)) {
    status = 'Not aired'
  }
  else {
    status = 'Unknown'
  }
  return status
}

//! This will give errors for ratings with more than 2 number probably.
function getAverage(param: string) {
  const arr = param.match(/(\d\.\d)|(\d+)/g)
  if (arr?.length > 1) {
    return ((parseFloat(arr[0]) + parseFloat(arr[1])) / 2)
  } else if (!arr) {
    //just to account for weird texts in rating field
    return 0
  } else {
    return parseFloat(param)
  }
}

//* Excluding fields for prisma
function exclude<Completed, Key extends keyof Completed>(
  completed: Completed,
  keys: Key[]
): Omit<Completed, Key> {
  for (let key of keys) {
    delete completed[key]
  }
  return completed
}