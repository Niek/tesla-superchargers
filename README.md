# tesla-superchargers

This is a daily updating repo containing a list of all Tesla Superchargers and the current prices for both members (Tesla owners and non-Tesla charging subscription members) and others.

---

### 🕸 Web Page: https://niek.github.io/tesla-superchargers/

### 🤖 JSON files: [`superchargers.json`](https://github.com/Niek/tesla-superchargers/raw/main/superchargers.json) and [`superchargers-with-pricing.json`](https://github.com/Niek/tesla-superchargers/raw/main/superchargers-with-pricing.json)

---

#### About the data

Unfortunately Tesla doesn't provide an API to get accurate Supercharger pricing information. The Tesla car MCU has access to the full pricing information, but this API is not accessible outside the MCU environment. The publicly accessible [CUE API](https://tesla.com/cua-api/tesla-locations) does not contain any pricing. This repo is using the GraphQL API used in the Tesla app when searching for "Charge Your Non-Tesla". Hence it only shows the data of Superchargers that are open to non-Tesla charging. For now, that consists of a subset of European Superchargers. The data is updated daily.