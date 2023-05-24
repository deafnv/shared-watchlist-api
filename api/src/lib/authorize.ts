import { RequestHandler } from 'express'

const authorize: RequestHandler = (req, res, next) => {
  if (!req.signedCookies.auth) return res.sendStatus(401)

  const rank = req.signedCookies.auth.split(':').pop()
  if (!rank || parseInt(rank) < 255) return res.sendStatus(403)

  return next()
}

export default authorize