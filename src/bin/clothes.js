#!/usr/bin/env node
// @flow
import fs from 'fs'
import isThere from 'is-there'
import Table from 'cli-table'

const HOME = process.env.HOME
if (HOME == null) throw new Error('HOME env variable is not set.')

const dbPath = `${HOME}/.clothes`

function printUsage () {
  console.log(`
  Usage: clothes [command] ...

  Commands:
  - help                 outputs this message
  - summary              renders a table of your used clothes sorted by last used date
  - used <clothes...>    stores usage of clothes in db
  `)
}

type Cloth = { name: string, lastUsed: Date, useCount: number }

function addClothData (clothes: { [key: string]: Cloth }, clothData: string) {
  const clothProps = clothData.split(',')
  const rawDate = clothProps[0]
  const clothName = clothProps[1]
  if (!rawDate || !clothName) return

  const useDate = new Date(rawDate)
  let cloth: ?Cloth = clothes[clothName]

  if (!cloth) {
    cloth = { name: clothName, lastUsed: useDate, useCount: 1 }
    clothes[clothName] = cloth
  } else {
    if (cloth.lastUsed < useDate) cloth.lastUsed = useDate
    cloth.useCount++
  }
}

function printTable (cb: (err: ?Error) => void) {
  const clothStream = fs.createReadStream(dbPath, { flags: 'r' })
  const clothes: { [key: string]: Cloth } = {}
  let leftoverData = ''

  clothStream.on('data', (chunk: Buffer) => {
    chunk.toString().split('\n').forEach((clothData, i, arr) => {
      // incomplete data, wait for next chunk or `end` event
      if (i === arr.length - 1) return

      // complete first eleme with previous chunk leftover data
      if (i === 0) clothData = leftoverData + clothData

      addClothData(clothes, clothData)
    })
  })
  clothStream.on('error', cb)
  clothStream.on('end', () => {
    const table = new Table({
      head: ['Last Used', 'Use Count', 'Name'],
      colWidths: [30, 11, 30]
    })

    const clothList = Object.keys(clothes).map((name) => clothes[name])
    clothList.sort((a, b) => b.lastUsed - a.lastUsed)
    clothList.forEach((c) => { table.push([c.lastUsed, c.useCount, c.name]) })

    process.stdout.write(table.toString() + '\n', cb)
  })
}

function useClothes (clothList: Array<string>, cb: (err: ?Error) => void) {
  const clothStream = fs.createWriteStream(dbPath, { flags: 'a' })
  const date = (new Date()).toISOString()

  console.log()
  clothStream.cork()
  clothStream.on('error', cb)
  clothStream.on('finish', () => {
    console.log()
    cb()
  })
  clothList.forEach((cloth) => {
    clothStream.write(`${date},${cloth}\n`)
    console.log(`> Recorded usage of '${cloth}' to db`)
  })
  clothStream.end()
}

function main () {
  let command = process.argv[2]
  command = (command || '').toLowerCase()

  // create db file if it doesn't exist
  if (!isThere(dbPath)) fs.openSync(dbPath, 'w')

  switch (command) {
    case 'help':
      printUsage()
      process.exit(0)
      break

    case 'used':
      const clothList = process.argv.slice(3)
      useClothes(clothList, (err) => {
        if (err) process.exit(1)
        printTable((err) => { process.exit(err ? 1 : 0) })
      })
      break

    case 'summary':
      printTable((err) => { process.exit(err ? 1 : 0) })
      break

    default:
      console.log('\n> Huh?')
      printUsage()
      process.exit(1)
  }
}
main()
