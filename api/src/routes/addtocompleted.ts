import express from 'express'
import { Database } from '../lib/supabase-types.js'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

router.post('/', async (req, res) => {
	const { body } = req
	const { content, id, type } = body

	if (!content || !id || !type || !(content instanceof Array)) 
		return res.status(400).send('Invalid content provided')
	
	const supabase = createClient<Database>(
		process.env.SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_API_KEY!
	)

	let cells
	let rowsToInsert
	const dataCompleted = await supabase
		.from('Completed')
		.select('id, title')
		.order('id', { ascending: false })
	if (!dataCompleted.data) return res.status(500).send('Failed to query database')

	let lastTitleCompletedID = 0
	let loopThrough = true
	let counter = 0
	while (loopThrough) {
		if (dataCompleted.data[counter].title) {
			lastTitleCompletedID = dataCompleted.data[counter].id + 1
			loopThrough = false
		} else {
			counter++
		}
	}

	console.log(lastTitleCompletedID)

	if (type === 'PTW') {
		const completedPTWRolled = content.filter(
			(item: Database['public']['Tables']['PTW-Rolled']['Row']) => item.id != id
		)
		completedPTWRolled.push({ id: completedPTWRolled.length + 1, status: 'Empty', title: '' })
		const endRowIndex1 = content.length + 1
		cells = `N2:N${endRowIndex1}`

		rowsToInsert = completedPTWRolled.map(
			(item: Database['public']['Tables']['PTW-Rolled']['Row']) => {
				const { red, green, blue } = determineStatus(item)
				return {
					values: [
						{
							userEnteredValue: {
								stringValue: item.title
							},
							userEnteredFormat: {
								backgroundColor: {
									red,
									green,
									blue
								}
							}
						}
					]
				}
			}
		)
	}
	else if (type === 'SEASONAL') {
		const completedSeasonal = content.filter(
			(item: Database['public']['Tables']['PTW-CurrentSeason']['Row']) => item.title != id //? id here is provided as entry title
		)
		completedSeasonal.push({ status: '', title: '', order: completedSeasonal.length + 1 })
		const endRowIndex1 = content.length + 1
		cells = `O2:P${endRowIndex1}`

		rowsToInsert = completedSeasonal.map(
			(item: Database['public']['Tables']['PTW-CurrentSeason']['Row']) => {
				const { red, green, blue } = determineStatus(item)
				return {
					values: [
						{
							userEnteredValue: {
								stringValue: item.title
							},
							userEnteredFormat: {
								backgroundColor: {
									red: 0.8,
									green: 0.8,
									blue: 0.8
								}
							}
						},
						{
							userEnteredFormat: {
								backgroundColor: {
									red,
									green,
									blue
								}
							}
						}
					]
				}
			}
		)
	}

	if (!cells || !rowsToInsert) return res.status(500)

	let range = cells.split(':')
	if (range.length < 2) return res.status(400).send('Invalid range provided')
	let startCell = range[0]
	let endCell = range[1]
	let startColumnIndex = startCell.charCodeAt(0) - 65
	let startRowIndex = parseInt(startCell.substring(1)) - 1
	let endColumnIndex = endCell.charCodeAt(0) - 64
	let endRowIndex = parseInt(endCell.substring(1))

	const auth = await google.auth.getClient({
		credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
		scopes: ['https://www.googleapis.com/auth/spreadsheets']
	})
	const sheets = google.sheets({ version: 'v4', auth })

	try {
		await sheets.spreadsheets.batchUpdate({
			spreadsheetId: process.env.SHEET_ID,
			requestBody: {
				requests: [
					{
						updateCells: {
							fields: 'userEnteredValue/stringValue, userEnteredFormat/backgroundColor',
							range: {
								sheetId: 0,
								startRowIndex,
								endRowIndex,
								startColumnIndex,
								endColumnIndex
							},
							rows: rowsToInsert
						}
					}
				]
			}
		})
	
		const newIndex = lastTitleCompletedID!
		console.log(lastTitleCompletedID)
		let completedTitle: any[]
		if (type === 'PTW') {
			completedTitle = content.filter(
				(item: Database['public']['Tables']['PTW-Rolled']['Row']) => item.id == id
			)
		} else if (type === 'SEASONAL') {
			completedTitle = content.filter(
				(item: Database['public']['Tables']['PTW-CurrentSeason']['Row']) => item.title == id //? id here is provided as entry title
			)
		}
		if (!completedTitle) return res.status(500)
		await sheets.spreadsheets.values.batchUpdate({
			spreadsheetId: process.env.SHEET_ID,
			requestBody: {
				data: [
					{
						range: `A${lastTitleCompletedID! + 1}:B${lastTitleCompletedID! + 1}`,
						majorDimension: 'ROWS',
						values: [[newIndex, completedTitle[0].title]]
					}
				],
				valueInputOption: 'USER_ENTERED'
			}
		})
	
		return res.status(200).send('OK')
	} catch (error) {
		console.log(error)
		return res.status(500).send(error)
	}
})

function determineStatus(item: any) {
	let red: number
	let green: number
	let blue: number
	switch (item.status) {
		case 'Watched':
			red = 0.20392157
			green = 0.65882355
			blue = 0.3254902
			break
		case 'Not loaded':
			red = 0.91764706
			green = 0.2627451
			blue = 0.20784314
			break
		case 'Loaded':
			red = 0.9843137
			green = 0.7372549
			blue = 0.015686275
			break
		case 'Empty':
			red = 0.8
			green = 0.8
			blue = 0.8
			break
		default:
			red = 0
			green = 0
			blue = 0
	}
	return { red, green, blue }
}

export default router