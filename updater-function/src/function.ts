import http from 'http'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import { Server } from 'socket.io'
import { google, sheets_v4 } from 'googleapis'
import { Completed, PTWCasual, PTWMovies, PTWNonCasual, PTWRolled, PrismaClient, Seasonal } from '@prisma/client'
import isEmpty from 'lodash/isEmpty.js'
import xorWith from 'lodash/xorWith.js'
import differenceWith from 'lodash/differenceWith.js'
import isEqual from 'lodash/isEqual.js'
import uniq from 'lodash/uniq.js'
import flatten from 'lodash/flatten.js'

import getTables from './get-table.js'
import emitRealtimeChanges, { Tables } from './realtime.js'

dotenv.config()

const app = express()

app.use(
  cors({origin: ['http://localhost:3000', 'http://127.0.0.1:3000'].concat(process.env.CORS_URL.split(','))})
)

app.use('/table', getTables)

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

export const io = new Server(httpServer, {
	cors: {
		origin: ['http://localhost:3000', 'http://192.168.0.102:3000'].concat(process.env.CORS_URL.split(',')),
	}
})

httpServer.listen(3004, () => {
  console.log('HTTP Server running on port 3004')
})

const auth = await google.auth.getClient({ credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
export const prisma = new PrismaClient()

let isFunctionRunning = true
//* Timer is reset by /refresh and only syncs the database and sheet if the time since last refresh is less than TIME_LIMIT
let timer = new Date().getTime()
const TIME_LIMIT = 1800000 //? 30 minutes

const updateDatabase = async () => {
  if (isFunctionRunning && new Date().getTime() - timer < TIME_LIMIT) {
    /* console.time('timer') */
    //? Left side of sheet
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
        startconv: isNaN(startconv.getTime()) ? '' : startconv.toISOString(),
        end: fixed[8] ?? '',
        endconv: isNaN(endconv.getTime()) ? '' : endconv.toISOString(),
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
    const dataCompleted = dataCompletedRaw.map(dataCompletedRawItem => exclude(dataCompletedRawItem, ['createdAt', 'updatedAt']))

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
        await prisma.completed.deleteMany({
          where: {
            id: {
              in: deletedCompletedIds
            }
          }
        })
      }
      
      await prisma.$transaction(
        differenceCompletedFromSheet.map(differenceCompletedFromSheetItem => {
          console.log(differenceCompletedFromSheetItem.startconv, differenceCompletedFromSheetItem.endconv)
          return prisma.completed.upsert({
            create: differenceCompletedFromSheetItem,
            update: differenceCompletedFromSheetItem,
            where: {
              id: differenceCompletedFromSheetItem.id
            }
          })
        })
      )

      emitRealtimeChanges('Completed', 'CHANGE')
    }

    //console.log(objectifiedResCompleted[37])
    //* If using differenceWith, do both ways.
    //console.log(differenceWith(objectifiedResCompleted, dataCompleted.data, isEqual))
    ///console.log(differenceWith(dataCompleted.data, objectifiedResCompleted, isEqual))

    //* This xorWith shows both differences in one array, kinda hard to separate
    //console.log(xorWith(objectifiedResCompleted, dataCompleted.data, isEqual))
    
    //? Right side of sheet
    const resRight = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SHEET_ID,
      ranges: ['L2:R45'],
      fields: 'sheets/data/rowData/values(formattedValue,userEnteredFormat/backgroundColor)'
    })

    //* Retrieve data in tables for comparison
    const dataCasual = await prisma.pTWCasual.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    const dataMovies = await prisma.pTWMovies.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    const dataNonCasual = await prisma.pTWNonCasual.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    const dataRolled = await prisma.pTWRolled.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    const dataSeasonal = await prisma.seasonal.findMany({
      orderBy: {
        order: 'asc'
      }
    })
    
    //* Fill out arrays with the details of each section of the right side of the sheet
    let casual: PTWCasual[] = []
    let movies: PTWMovies[] = []
    let nonCasual: PTWNonCasual[] = []
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

      if (index < 15 && item.values[1].formattedValue) {
        nonCasual.push({id: index, title: item.values[1].formattedValue})
      }

      if (index < 21 && item.values[2].formattedValue) {
        ptwInOrder.push({
          id: index, 
          title: item.values[2].formattedValue,
          status: determineState(item.values[2]?.userEnteredFormat.backgroundColor)
        })
      }
      
      if (index < 21 && item.values[3]?.formattedValue) {
        currentSeason.push({
          title: item.values[3].formattedValue,
          status: determineState(item.values[4]?.userEnteredFormat.backgroundColor),
          order: index
        })
      }
    })

    await commitDifference(
      'PTWCasual',
      casual, 
      dataCasual, 
      async (deletedIds) => {
        await prisma.pTWCasual.deleteMany({
          where: {
            id: {
              in: deletedIds
            }
          }
        })
      },
      async (differenceFromSheet) => {
        await prisma.$transaction(
          differenceFromSheet.map(differenceFromSheetItem => {
            return prisma.pTWCasual.upsert({
              create: differenceFromSheetItem,
              update: differenceFromSheetItem,
              where: {
                id: differenceFromSheetItem.id
              }
            })
          })
        )
      }
    )
    await commitDifference(
      'PTWNonCasual',
      nonCasual, 
      dataNonCasual, 
      async (deletedIds) => {
        await prisma.pTWNonCasual.deleteMany({
          where: {
            id: {
              in: deletedIds
            }
          }
        })
      },
      async (differenceFromSheet) => {
        await prisma.$transaction(
          differenceFromSheet.map(differenceFromSheetItem => {
            return prisma.pTWNonCasual.upsert({
              create: differenceFromSheetItem,
              update: differenceFromSheetItem,
              where: {
                id: differenceFromSheetItem.id
              }
            })
          })
        )
      }
    )
    await commitDifference(
      'PTWMovies',
      movies, 
      dataMovies, 
      async (deletedIds) => {
        await prisma.pTWMovies.deleteMany({
          where: {
            id: {
              in: deletedIds
            }
          }
        })
      },
      async (differenceFromSheet) => {
        await prisma.$transaction(
          differenceFromSheet.map(differenceFromSheetItem => {
            return prisma.pTWMovies.upsert({
              create: differenceFromSheetItem,
              update: differenceFromSheetItem,
              where: {
                id: differenceFromSheetItem.id
              }
            })
          })
        )
      }
    )
    await commitDifference(
      'PTWRolled',
      ptwInOrder, 
      dataRolled, 
      async (deletedIds) => {
        await prisma.pTWRolled.deleteMany({
          where: {
            id: {
              in: deletedIds
            }
          }
        })
      },
      async (differenceFromSheet) => {
        await prisma.$transaction(
          differenceFromSheet.map(differenceFromSheetItem => {
            return prisma.pTWRolled.upsert({
              create: differenceFromSheetItem,
              update: differenceFromSheetItem,
              where: {
                id: differenceFromSheetItem.id
              }
            })
          })
        )
      }
    )
    await commitDifferenceSeasonal(currentSeason, dataSeasonal)
    
    /* console.timeEnd('timer') */
  }
}

await updateDatabase()
setInterval(updateDatabase, 3000)

async function commitDifferenceSeasonal(sheetValues: Seasonal[], dataFromDB: Seasonal[]) {
  //!Account for transposition/deletes
  if (dataFromDB.length > sheetValues.length) {
    const removedOrderDB = dataFromDB.map(item => exclude(item, ['order']))
    const removedOrderSheet = sheetValues.map(item => exclude(item, ['order']))
    const missingItem = uniq(xorWith(removedOrderSheet, removedOrderDB, isEqual).map(item => {
      return item.title
    }))
    
    await prisma.seasonal.deleteMany({
      where: {
        title: {
          in: missingItem
        }
      }
    })
  }

  const difference = uniq(xorWith(sheetValues, dataFromDB, isEqual).map(item => {
    return item.title
  }))
  if (difference?.length > 0) {
    const differenceFromSheet = flatten(difference.map(item => {
      return sheetValues.filter(title => {
        return title.title === item
      })
    }))
    
    await prisma.$transaction(
      differenceFromSheet.map(differenceFromSheetItem => {
        return prisma.seasonal.upsert({
          create: differenceFromSheetItem,
          update: differenceFromSheetItem,
          where: {
            title: differenceFromSheetItem.title
          }
        })
      })
    )

    emitRealtimeChanges('Seasonal', 'CHANGE')
  }
}

//TODO: Improve this commitDifference function to reflect the more efficient commitDifference above
async function commitDifference(
  table: Tables,
  sheetValues: any[], 
  dataFromDB: any[],
  deleteCb: (deletedIds: number[]) => Promise<void>,
  upsertCb: (differenceFromSheet: any[]) => Promise<void>
) {
  const difference = uniq(xorWith(sheetValues, dataFromDB, isEqual).map(item => {
    return item.id
  }))
  if (difference?.length > 0) {
    const differenceFromSheet = flatten(difference.map(item => {
      return sheetValues.filter(title => {
        return title.id === item
      })
    }))

    //? Accounting for deletes
    if (dataFromDB.length > sheetValues.length) {
      const deletedIds = differenceWith(dataFromDB, sheetValues, isEqual).map(item => {
        return item.id
      })
      await deleteCb(deletedIds)
    }
    await upsertCb(differenceFromSheet)

    emitRealtimeChanges(table, 'CHANGE')
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
    //* just to account for weird texts in rating field
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