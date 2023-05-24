import fs from 'fs'

//* Use function: `File ${filename} downloaded by ${ipaddress}`
export default function log(data: string) {
  const logStream = fs.createWriteStream('events-log.log', { flags: 'a' })
  const logText = `[${new Date().toISOString()}] ${data}\n`
  process.stdout.write(logText)
  logStream.write(logText)
  logStream.end()
}