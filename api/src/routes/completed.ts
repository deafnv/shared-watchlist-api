import express from 'express'
import { prisma } from '../index.js'
import axios from 'axios'
import uniqBy from 'lodash/uniqBy.js'
import { load } from 'cheerio'
import isEqual from 'lodash/isEqual.js'
import xorWith from 'lodash/xorWith.js'
import { Genres, GenresOnCompleted, UnwatchedSequels } from '@prisma/client'

const router = express.Router()

router.get('/loadcompleteddetails', async (req, res) => {
	try {
		const dataDBCompleted = await prisma.completed.findMany({
			include: {
				details: {
					select: {
						mal_id: true
					}
				}
			},
			orderBy: {
				id: 'asc'
			}
		})

		if (!dataDBCompleted) return res.status(500).send('Something went wrong when retreiving data from database')

		const dataDBUnprocessed = dataDBCompleted.filter(item => (!item.details || item.details.mal_id == -1))
		if (dataDBCompleted.length == 0) return res.status(200).send('No more to update')

		let genres: Genres[] = []
		let genreRelationships: Omit<GenresOnCompleted, 'id'>[] = []
		const malResponse = await Promise.all(
			dataDBUnprocessed.map(async (item, index) => {
				if (!item.title) {
					return {
						end_date: '',
						title_id: item.id,
						image_url: '',
						mal_alternative_title: '',
						mal_id: -1,
						mal_title: '',
						mal_synopsis: '',
						mal_rating: 0,
						start_date: '',
						average_episode_duration: -1
					}
				}
				const { data } = await axios.get(
					`https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(
						item.title!.substring(0, 64).replace('86', 'eighty six')
					)
						.replaceAll('%20', '+')
						.replaceAll('%2520', '+')
						.replaceAll('(', '%28')}`,
					{
						headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID },
						params: {
							limit: 5,
							fields:
								'alternative_titles,start_date,end_date,genres,synopsis,average_episode_duration,mean'
						}
					}
				)

				genres = genres.concat(data?.data[0].node.genres)

				data?.data[0].node.genres.forEach((item1: { id: number; name: string }) => {
					genreRelationships.push({
						completed_id: item.id,
						genre_id: item1.id
					})
				})

				return {
					end_date: data?.data[0].node.end_date ?? '',
					title_id: item.id,
					image_url: data?.data[0].node.main_picture.large ?? '',
					mal_alternative_title: data?.data[0].node.alternative_titles.en ?? '',
					mal_id: parseInt(data?.data[0].node.id),
					mal_title: data?.data[0].node.title,
					mal_synopsis: data?.data[0].node.synopsis ?? '',
					mal_rating: data?.data[0].node.mean ?? 0,
					start_date: data?.data[0].node.start_date ?? '',
					average_episode_duration: data?.data[0].node.average_episode_duration ?? 0
				}
			})
		)

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

		await prisma.completedDetails.createMany({
			data: malResponse
		})

		const completedIds = genreRelationships.map(genreRelationship => genreRelationship.completed_id)

		await prisma.genresOnCompleted.deleteMany({
			where: {
				completed_id: {
					in: completedIds
				}
			}
		})

		await prisma.genresOnCompleted.createMany({
			data: genreRelationships
		})

		return res.sendStatus(200)
	} catch (error) {
		console.error(error)
		return res.status(500).send(error)
	}
})

router.get('/loadsequels', async (req, res) => {
	try {
		/* await supabase
			.from('UnwatchedSequels')
			.delete()
			.neq('id', -2) */

		const dataDBCompleted = await prisma.completed.findMany({
			include: {
				details: {
					select: {
						mal_id: true
					}
				}
			},
			orderBy: {
				id: 'asc'
			}
		})

		const dataDBSequels = await prisma.unwatchedSequels.findMany()
		if (!dataDBCompleted) return res.status(500).send('Something went wrong when retreiving data from database')
		
		//* Find all titles that doesn't already have an unwatched sequel loaded in the table 
		const noSequelsMalId = xorWith(
			dataDBCompleted?.map(item => {
				return {
					id: item.id,
					mal_id: item.details.mal_id
				}
			}), 
			dataDBSequels?.map(item => ({
				id: item.title_id,
				mal_id: item.mal_id,
			})), 
			isEqual)

		/* const leftJoin = await supabase
			.from('Completed')
			.select('*, UnwatchedSequels!left(*)')
			.eq('UnwatchedSequels.anime_id', null)

		console.log(leftJoin.error)
		console.log(leftJoin.data) */

		const completedMalIds = dataDBCompleted.map(item => item.details.mal_id).filter(i => i)

		res.sendStatus(200)

		//TODO: Blocking. Takes way too long, this just gets blocked by MAL
		let counter = 0
		let sequels: UnwatchedSequels[] = []
		for (const item of noSequelsMalId) {
			counter++
			
			const cheerioData = await axios.get(`https://myanimelist.net/anime/${item.mal_id}`, {
				headers: { 'Accept-Encoding': 'gzip,deflate,compress' }
			})
			const $ = load(cheerioData.data)
			const relatedTable = $('table.anime_detail_related_anime').children().first().children()
			const status = await new Promise(async resolve => {
				let sequel: any
				for (const element of relatedTable) {
					if ($(element).text().trim().includes('Sequel:')) {
						//* If the found sequel hasn't already been watched, find the information on the sequel and add it
						if (!completedMalIds.includes(parseInt($(element).children().last().children().attr('href')?.split('/')[2] ?? '0'))) {
							try {
								const { data } = await axios.get(`https://myanimelist.net${$(element).children().last().children().attr('href')!}`, {
									headers: { 'Accept-Encoding': 'gzip,deflate,compress' }
								})
								const $$ = load(data)
								const status = $$('h2:contains("Information")').next().next().next().text()

								if (status.includes('Finished Airing')) {
									sequel = ({
										title_id: item.id,
										mal_id: item.mal_id,
										sequel_title: $(element).children().last().text(),
										sequel_mal_id: parseInt($(element).children().last().children().attr('href')?.split('/')[2] ?? '0')
									})
								}
							} catch (error) {
								console.error(error)
							}
						}
					}
				}
				resolve(sequel)
			})
			if (status) sequels.push(status as UnwatchedSequels)
		}
			
		await prisma.$transaction(
			sequels.map(sequel => prisma.unwatchedSequels.upsert({
				create: sequel,
				update: sequel,
				where: {
					title_id: sequel.title_id
				}
			}))
		)
	} 
	catch (error) {
		console.error(error)
		return res.status(500).send(JSON.stringify(error))
	}
})

export default router