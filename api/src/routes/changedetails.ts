import express from 'express'
import axios from 'axios'
import uniqBy from 'lodash/uniqBy.js'
import { prisma } from '../index.js'
import { Genres, GenresOnCompleted } from '@prisma/client'

const router = express.Router()

router.post('/', async (req, res) => {
	const { id, mal_id, type } = req.body

  //* Ignore completed error, false positive
  if (type == 'IGNORE_ERROR') {
    try {
      const ignoreError = {
        title_id: id,
        message: 'IGNORE'
      }
      await prisma.completedErrors.update({
        data: ignoreError,
        where: {
          title_id: ignoreError.title_id
        }
      })

      return res.status(200).send('OK')
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  } 
  //* Ignores unwatched sequel
  else if (type == 'IGNORE_SEQUEL') {
    try {
      const ignoreSequel = {
        id: id,
        message: 'IGNORE'
      }
      prisma.unwatchedSequels.update({
        data: ignoreSequel,
        where: {
          id: ignoreSequel.id
        }
      })

      return res.status(200).send('OK')
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  }
  //* Change details of completed anime and insert all its relevant data from MAL
  else {
    try {
      const { data } = await axios.get(`https://api.myanimelist.net/v2/anime/${mal_id}`, {
        headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID },
        params: {
          fields:
            'alternative_titles,start_date,end_date,genres,synopsis,average_episode_duration,mean'
        }
      })

      await prisma.genresOnCompleted.deleteMany({
        where: {
          completed_id: id
        }
      })

      let genres: Genres[] = []
      let genreRelationships: Omit<GenresOnCompleted, 'id'>[] = []
      genres = genres.concat(data?.genres)

      data?.genres.forEach((item1: { id: number; name: string }) => {
        genreRelationships.push({
          completed_id: id,
          genre_id: item1.id
        })
      })

      const genresNoDupe = uniqBy(genres, 'id')
      await prisma.$transaction(
        genresNoDupe.map(genre => prisma.genres.upsert({
          create: genre,
          update: genre,
          where: {
            id: genre.id
          }
        }))
      )

      await prisma.genresOnCompleted.createMany({
        data: genreRelationships
      })

      //* Delete any empty genres after updating genres previously
      const deleteEmptyGenres = await prisma.genres.findMany({
        where: {
          completeds: {
            none: {}
          }
        }
      })

      const genreIds = deleteEmptyGenres.map(genre => genre.id)
      await prisma.genres.deleteMany({
        where: {
          id: {
            in: genreIds
          }
        }
      })

      const anime = {
        end_date: data?.end_date ?? '',
        title_id: id,
        image_url: data?.main_picture.large ?? '',
        mal_alternative_title: data?.alternative_titles.en ?? '',
        mal_id: parseInt(data?.id),
        mal_title: data?.title,
        mal_synopsis: data?.synopsis ?? '',
        mal_rating: data?.mean ?? 0,
        start_date: data?.start_date ?? '',
        average_episode_duration: data?.average_episode_duration ?? 0
      }

      await prisma.completedDetails.delete({
        where: {
          id: id
        }
      })

      await prisma.completedDetails.create({
        data: anime
      })

      await prisma.completedErrors.update({
        data: {
          message: type
        },
        where: {
          title_id: id
        }
      })

      return res.status(200).send(anime)
    } catch (error) {
      console.log(error)
      return res.status(500).send(error)
    }
  }
})

export default router