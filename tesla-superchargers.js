const { writeFile, readFile } = require('node:fs/promises')
const { program } = require('commander')
const { renderFile } = require('ejs')
const { HttpsProxyAgent } = require('hpagent')

const domain = 'https://akamai-apigateway-charging-ownership.tesla.com'

// To use a proxy, set environment variable HTTP_PROXY like this: http://user:password@host:port
const apiCall = async (url, json, token) => {
  const { got } = await import('got')

  try {
    return await got.post(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux)',
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`
      },
      retry: {
        methods: ['GET', 'POST'],
        limit: 5
      },
      json,
      ...(process.env.HTTP_PROXY ? { agent: { https: new HttpsProxyAgent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 256, maxFreeSockets: 256, scheduling: 'lifo', proxy: process.env.HTTP_PROXY }) } } : {})
    }).json()
  } catch (e) {
    console.error(`Error calling API: ${e.message}`)
    return {}
  }
}

// Render the JSON file to a HTML page
const renderPage = async (filename) => {
  // Load the JSON file
  const superchargers = Object.entries(JSON.parse(await readFile('superchargers-with-pricing.json')))
    // Remove the id
    .map(([id, supercharger]) => supercharger)
    // Filter out the superchargers without prices
    .filter(charger => charger.prices)
    // Sort by name
    .sort((a, b) => a.name.localeCompare(b.name))

  // Get all prices per currency
  const pricesPerCurrency = superchargers.reduce((acc, supercharger) => {
    const currency = supercharger.prices.user.currency
    const ratesUser = supercharger.prices.user.rates
    const ratesMember = supercharger.prices.member.rates

    // Initialize the currency if needed
    if (!acc.user[currency] || !acc.member[currency]) {
      acc.user[currency] = []
      acc.member[currency] = []
    }

    // Add the rates
    acc.user[currency].push(...ratesUser)
    acc.member[currency].push(...ratesMember)

    return acc
  }, { user: {}, member: {} })

  // Calculate the average price per currency
  const averagePrices = Object.entries(pricesPerCurrency).reduce((acc, [type, currencies]) => {
    acc[type] = Object.entries(currencies).reduce((acc, [currency, rates]) => {
      acc[currency] = rates.reduce((acc, rate) => acc + rate, 0) / rates.length
      return acc
    }, {})
    return acc
  }, {})

  // Calculate current date and time
  const rendered = new Date().toLocaleString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' })

  // Render the page and write the content to the file
  const page = await renderFile('page.ejs', { superchargers, averagePrices, rendered }, { async: true })
  await writeFile(filename, page)

  console.log(`Rendered ${filename}`)
}

const getSuperchargers = async (token) => {
  const superchargers = {}
  const promises = []

  const start = [40, -5]
  const stop = [60, 15]

  // TODO: use https://www.tesla.com/cua-api/tesla-locations instead as a basis

  for (let latitude = start[0]; latitude < stop[0]; latitude += 1) {
    for (let longitude = start[1]; longitude < stop[1]; longitude += 1) {
      promises.push(async function () {
        const entries = await apiCall(`${domain}/graphql?operationName=GetNearbyChargingSites`,
          {
            query: 'query GetNearbyChargingSites($args: GetNearbyChargingSitesRequestType!) { charging { nearbySites(args: $args) { sitesAndDistances { ...ChargingNearbySitesFragment } } } } fragment ChargingNearbySitesFragment on ChargerSiteAndDistanceType { activeOutages { message } availableStalls { value } centroid { ...EnergySvcCoordinateTypeFields } drivingDistanceMiles { value } entryPoint { ...EnergySvcCoordinateTypeFields } haversineDistanceMiles { value } id { text } localizedSiteName { value } maxPowerKw { value } totalStalls { value } siteType accessType } fragment EnergySvcCoordinateTypeFields on EnergySvcCoordinateType { latitude longitude }',
            variables: {
              args: {
                userLocation: { latitude, longitude },
                northwestCorner: { latitude: latitude + 1, longitude: longitude - 1 },
                southeastCorner: { latitude: latitude - 1, longitude: longitude + 1 },
                openToNonTeslasFilter: { value: false },
                languageCode: 'en',
                countryCode: 'US'
              }
            }
          },
          token)
        if (entries.data && entries.data.charging && entries.data.charging.nearbySites && entries.data.charging.nearbySites.sitesAndDistances) {
          for (const entry of entries.data.charging.nearbySites.sitesAndDistances) {
            superchargers[entry.id.text] = {
              location: entry.centroid,
              name: entry.localizedSiteName.value,
              power: entry.maxPowerKw.value,
              stalls: entry.totalStalls.value,
              type: entry.siteType,
              access: entry.accessType
            }
          }
        }
      })
    }
  }

  console.log(`Calling the nearby chargers API ${promises.length} times...`)

  await executeInChunk(promises, 15)

  console.log(`Found ${Object.keys(superchargers).length} superchargers`)

  await writeFile('superchargers.json', JSON.stringify(superchargers, replacer, 2))
}

const getPrices = async (token) => {
  const superchargers = JSON.parse(await readFile('superchargers.json'))

  const promises = []
  for (const id of Object.keys(superchargers)) {
    promises.push(async function () {
      const prices = await apiCall(`${domain}/graphql?operationName=GetChargingSitePricing`,
        {
          query: 'query GetChargingSitePricing($siteId: String!, $deviceCountry: String!, $deviceLanguage: String!, $upselling: Boolean) { charging { sitePricing( siteId: $siteId deviceCountry: $deviceCountry deviceLanguage: $deviceLanguage upselling: $upselling ) { userRates { ...ChargingSiteRatesFragment } memberRates { ...ChargingSiteRatesFragment } } } } fragment ChargingSiteRatesFragment on ChargingSiteRatesType { charging { uom rates currencyCode programType priceBookID vehicleMakeType } parking { uom rates currencyCode programType priceBookID vehicleMakeType } }',
          variables: {
            siteId: id,
            deviceLanguage: 'en',
            deviceCountry: 'US'
          }
        },
        token)
      if (prices.data && prices.data && prices.data.charging && prices.data.charging.sitePricing) {
        superchargers[id].prices = {
          user: {
            rates: prices.data.charging.sitePricing.userRates.charging.rates,
            currency: prices.data.charging.sitePricing.userRates.charging.currencyCode,
            metric: prices.data.charging.sitePricing.userRates.charging.uom
          },
          member: {
            rates: prices.data.charging.sitePricing.memberRates.charging.rates,
            currency: prices.data.charging.sitePricing.memberRates.charging.currencyCode,
            metric: prices.data.charging.sitePricing.memberRates.charging.uom
          }
        }
      }
    })
  }

  console.log(`Calling the pricing API ${promises.length} times...`)

  await executeInChunk(promises, 10)

  console.log(`Updated ${Object.keys(superchargers).length} superchargers`)

  await writeFile('superchargers-with-pricing.json', JSON.stringify(superchargers, replacer, 2))
}

// Execute a list of promises in batches of chunkSize
const executeInChunk = async (promises, chunkSize) => {
  for (let i = 0; i < promises.length; i += chunkSize) {
    const chunk = promises.slice(i, i + chunkSize)
    console.log(`Calls ${i}-${i + chunk.length}...`)
    await Promise.all(chunk.map(f => f()))
  }
}

// For ordering object on keys, see https://gist.github.com/davidfurlong/463a83a33b70a3b6618e97ec9679e490
const replacer = (key, value) =>
  value instanceof Object && !(value instanceof Array)
    ? Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = value[key]
        return sorted
      }, {})
    : value

program
  .name('tesla-superchargers')
  .description('Tesla superchargers updater')

program.command('update-chargers')
  .argument('<api-token>', 'Tesla API token')
  .action(async (token) => { await getSuperchargers(token) })

program.command('update-prices')
  .argument('<api-token>', 'Tesla API token')
  .action(async (token) => { await getPrices(token) })

program.command('render-page')
  .argument('<filename>', 'HTML file to render')
  .action(async (filename) => { await renderPage(filename) })

program.parse()
