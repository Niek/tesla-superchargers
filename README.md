# tesla-superchargers

This is a daily updating repo containing a list of all Tesla Superchargers and the current prices for both members (Tesla owners and non-Tesla charging subscription members) and others.

---

### 🕸 Web Page: https://niek.github.io/tesla-superchargers/

### 🤖 JSON files: [`superchargers.json`](https://github.com/Niek/tesla-superchargers/raw/main/superchargers.json) and [`superchargers-with-pricing.json`](https://github.com/Niek/tesla-superchargers/raw/main/superchargers-with-pricing.json)

---

#### About the data

Unfortunately Tesla doesn't provide an API to get accurate Supercharger pricing information. The Tesla car MCU has access to the full pricing information, but this API is not accessible outside the MCU environment. The publicly accessible [CUE API](https://tesla.com/cua-api/tesla-locations) does not contain any pricing. This repo is using the GraphQL API used in the Tesla app when searching for "Charge Your Non-Tesla". Hence it only shows the data of Superchargers that are open to non-Tesla charging. For now, that consists of a subset of European Superchargers. The data is updated daily.

#### Running the script yourself

First, get a Tesla auth token by going to https://tesla-info.com/tesla-token.php and following the instructions. Then, run the script with the token as an argument:

```bash
node tesla-superchargers.js update-chargers <token>
node tesla-superchargers.js update-prices <token>
node tesla-superchargers.js render-page public/index.html
```

Finally, open `public/index.html` in your browser.