import express from 'express'
import { prisma } from './function.js'

const router = express.Router()

router.get('/completed', async (req, res) => {
	const completed = await prisma.completed.findMany({
    orderBy: {
      id: 'desc'
    }
  })
  return res.send(completed)
})

router.get('/completeddetails', async (req, res) => {
  const { id } = req.query //? Completed id
  if (typeof id !== 'string') return res.sendStatus(400)
  const completedDetails = await prisma.completedDetails.findFirst({
    where: {
      title_id: {
        equals: parseInt(id)
      }
    }
  })
  return res.send(completedDetails)
})

router.get('/genre', async (req, res) => {
  const genres = await prisma.genres.findMany({
    orderBy: {
      id: 'asc'
    }
  })
  return res.send(genres)
})

router.get('/completedsbygenreid', async (req, res) => {
  const { id } = req.query //? Array of genre ids
  if (!(id instanceof Array) || id.some(item => typeof item != 'string')) return res.sendStatus(400)
  const parsedIds = id.map(item => parseInt(item as string))
  //FIXME: Do proper inner join
  const completeds = await prisma.completed.findMany({
    where: {
      genres: {
        some: {
          genre_id: {
            in: parsedIds
          }
        }
      }
    },
    include: {
      genres: true
    },
    orderBy: {
      id: 'desc'
    }
  })
  return res.send(completeds)
})

router.get('/genresofid', async (req, res) => {
  const { id } = req.query //? Completed id
  if (typeof id !== 'string') return res.sendStatus(400)
  const genresOfId = await prisma.genres.findMany({
    where: {
      completeds: {
        some: {
          completed_id: {
            equals: parseInt(id)
          }
        }
      }
    }
  })
  return res.send(genresOfId)
})

router.get('/sequels', async (req, res) => {
  const unwatchedSequels = await prisma.unwatchedSequels.findMany({
    include: {
      completed: {
        select: {
          title: true
        }
      }
    }
  })

  return res.send(unwatchedSequels)
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