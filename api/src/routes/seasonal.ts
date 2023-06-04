import axios from 'axios'
import { load } from 'cheerio'
import express from 'express'
import { prisma } from '../index.js'

const router = express.Router()

router.get('/batchtrack', async (req, res) => {
	try {
		const dataDB = await prisma.seasonalDetails.findMany({
      where: {
        message: {
          not: {
            search: 'Exempt'
          }
        }
      }
    })
    if (!dataDB) return res.status(500).send('Failed to retrieve database info')

    let latestEpisodes: any[] = []
    await Promise.all(
      dataDB.map(async (item, index) => {
        const cheerioData = await axios.get(`https://myanimelist.net/anime/${item.mal_id}/a/forum?topic=episode`, {
					headers: { 'Accept-Encoding': 'gzip,deflate,compress' }
				})
        const $ = load(cheerioData.data)
        const latestEpisode = $('tr#topicRow1').find('td.forum_boardrow1:nth-child(2) > a').text().match(/Episode (\d+)/)?.[1]
        const episodeCount = $('h2:contains("Information")').next().next().text()
        const status = $('h2:contains("Information")').next().next().next().text()
        latestEpisodes.push({
          mal_id: item.mal_id,
          latest_episode: parseInt(latestEpisode ?? '-1'),
          last_updated: new Date().getTime(),
          num_episodes: parseInt(episodeCount.trim().split(/\s+/).pop() ?? '-1'),
          status: parseStatus(status)
        })
      })
    )

    await prisma.$transaction(
      latestEpisodes.map(latestEpisode => prisma.seasonalDetails.update({
        data: latestEpisode,
        where: {
          mal_id: latestEpisode.mal_id
        }
      }))
    )

    return res.status(200).send(latestEpisodes)
	} catch (error) {
		console.error(error)
		return res.status(500).send(error)
	}
})

router.post('/trackitem', async (req, res) => {
	const { body } = req
	const { id } = body

	try {
		const { data } = await axios.get(`https://myanimelist.net/anime/${id}/a/forum?topic=episode`, {
			headers: { 'Accept-Encoding': 'gzip,deflate,compress' }
		})
		const $ = load(data)
    const latestEpisode = $('tr#topicRow1').find('td.forum_boardrow1:nth-child(2) > a').text().match(/Episode (\d+)/)?.[1]
    const episodeCount = $('h2:contains("Information")').next().next().text()
    const status = $('h2:contains("Information")').next().next().next().text()
    const toUpsert = {
      mal_id: id,
      latest_episode: parseInt(latestEpisode ?? '-1'),
      last_updated: new Date().getTime(),
      num_episodes: parseInt(episodeCount.trim().split(/\s+/).pop() ?? '-1'),
      status: parseStatus(status)
    }

    await prisma.seasonalDetails.update({
      data: toUpsert,
      where: {
        mal_id: toUpsert.mal_id
      }
    })

		return res.status(200).send(toUpsert)
	} catch (error) {
		console.error(error)
		return res.status(500).send(error)
	}
})

export default router

function parseStatus(status: string) {
  if (status.includes('Currently Airing')) {
    return 'currently_airing'
  } else if (status.includes('Finished Airing')) {
    return 'finished_airing'
  } else if (status.includes('Not yet aired')) {
    return 'not_yet_aired'
  } else {
    return 'unknown'
  }
}