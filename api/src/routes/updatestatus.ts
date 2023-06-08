import { google } from 'googleapis'
import express from 'express'

const router = express.Router()

router.post('/', async (req, res) => {
  const { body } = req
	const { content, cells } = body

	let red: number
	let green: number
	let blue: number
	switch (content) {
		case 'Watched':
			red = 0.5764706
			green = 0.76862746
			blue = 0.49019608
			break
		case 'Not loaded':
			red = 0.91764706
			green = 0.6
			blue = 0.6
			break
		case 'Loaded':
			red = 0.9764706
			green = 0.79607844
			blue = 0.6117647
			break
    case 'Not downloaded':
      red = 0.8
			green = 0.8
			blue = 0.8
			break
		case 'Not aired':
			red = 0
			green = 0
			blue = 0
			break
		default:
			red = 1
			green = 1
			blue = 1
	}

	let range = cells.split(':')
	if (range.length < 2) return res.status(400).send('Invalid range provided')
	let startCell = range[0]
	let endCell = range[1]
	let startColumnIndex = startCell.charCodeAt(0) - 65
	let startRowIndex = parseInt(startCell.substring(1)) - 1
	let endColumnIndex = endCell.charCodeAt(0) - 64
	let endRowIndex = parseInt(endCell.substring(1))

  const rows = Array(endRowIndex - startRowIndex).fill({
    values: {
      userEnteredFormat: {
        backgroundColor: {
          red,
          green,
          blue
        }
      }
    }
  })

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
              fields: 'userEnteredFormat/backgroundColor',
              range: {
                sheetId: 0,
                startRowIndex,
                endRowIndex,
                startColumnIndex,
                endColumnIndex
              },
              rows
            }
          }
        ]
      }
    })

    return res.status(200).send('OK')
  } catch (error) {
    console.log(error)
    return res.status(500).send(error)
  }
})

export default router