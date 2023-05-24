import { google } from 'googleapis'
import express from 'express'

const router = express.Router()

router.post('/', async (req, res) => {
	const { body } = req
	const { content, cell, type, length } = body

	const auth = await google.auth.getClient({
		credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
		scopes: ['https://www.googleapis.com/auth/spreadsheets']
	})
	const sheets = google.sheets({ version: 'v4', auth })

	if (type == 'MULTI') {
		try {
			await sheets.spreadsheets.values.update({
				spreadsheetId: process.env.SHEET_ID,
				range: cell,
				valueInputOption: 'USER_ENTERED',
				requestBody: {
					majorDimension: 'COLUMNS',
					values: [Array(length).fill(content)]
				}
			})
			console.log('multimode')
			return res.status(200).send('OK')
		} catch (error) {
			console.log(error)
		}
	}

	try {
		await sheets.spreadsheets.values.update({
			spreadsheetId: process.env.SHEET_ID,
			range: cell,
			valueInputOption: 'USER_ENTERED',
			requestBody: {
				values: [[content]]
			}
		})
		return res.status(200).send('OK')
	} catch (error) {
		console.log(error)
	}
})

export default router