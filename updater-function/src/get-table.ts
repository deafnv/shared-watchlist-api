import express from 'express'
import { google } from 'googleapis'
import { prisma } from './function.js'
import { PTWRolled, Seasonal } from '@prisma/client'

const router = express.Router()

router.get('/completed', async (req, res) => {
	const completed = await prisma.completed.findMany({
    orderBy: {
      id: 'desc'
    }
  })
  return res.send(completed)
})

router.get('/ptwrolled', async (req, res) => {
	const ptwRolled = await prisma.pTWRolled.findMany({
    orderBy: {
      id: 'asc'
    }
  })
  return res.send(ptwRolled)
})

router.get('/ptwcasual', async (req, res) => {
	const ptwCasual = await prisma.pTWCasual.findMany({
    orderBy: {
      id: 'asc'
    }
  })
  return res.send(ptwCasual)
})

router.get('/ptwnoncasual', async (req, res) => {
	const ptwNonCasual = await prisma.pTWNonCasual.findMany({
    orderBy: {
      id: 'asc'
    }
  })
  return res.send(ptwNonCasual)
})

router.get('/ptwmovies', async (req, res) => {
	const ptwMovies = await prisma.pTWMovies.findMany({
    orderBy: {
      id: 'asc'
    }
  })
  return res.send(ptwMovies)
})

router.get('/seasonal', async (req, res) => {
	const seasonal = await prisma.seasonal.findMany({
    include: {
      details: {
        select: {
          mal_id: true,
          start_date: true,
          latest_episode: true
        }
      }
    },
    orderBy: {
      order: 'asc'
    }
  })
  return res.send(seasonal)
})

export default router