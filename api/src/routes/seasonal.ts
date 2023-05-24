import axios from 'axios'
import { load } from 'cheerio'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { Database } from '../lib/supabase-types.js'

const router = express.Router()

router.get('/batchtrack', async (req, res) => {
	try {
		const supabase = createClient<Database>(
			process.env.SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_API_KEY!
		)
		const dataDB = await supabase
			.from('SeasonalDetails')
			.select()
			.not('message', 'ilike', '%Exempt%')
    if (!dataDB.data) return res.status(500).send('Failed to retrieve database info')

    let latestEpisodes: Array<{}> = []
    await Promise.all(
      dataDB.data.map(async (item, index) => {
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

    await supabase.from('SeasonalDetails').upsert(latestEpisodes)

    return res.status(200).send(latestEpisodes)
	} catch (error) {
		console.log(error)
		return res.status(500).send(error)
	}
})

router.post('/trackitem', async (req, res) => {
	const { body } = req
	const { id } = body

	try {
		//* Through testing, these API routes with restricted queries like UPDATE, DELETE, or INSERT fails silently if the public API key is provided instead of the service key
		const supabase = createClient<Database>(
			process.env.SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_API_KEY!
		)
		
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

		await supabase.from('SeasonalDetails').upsert(toUpsert)

		return res.status(200).send(toUpsert)
	} catch (error) {
		console.log(error)
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