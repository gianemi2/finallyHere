const puppeteer = require('puppeteer-extra');
const fetch = require('node-fetch')
const axios = require('axios')
const fs = require('fs')
const imageToBase64 = require('image-to-base64');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const { telegram, telegramDev, captchaAPI } = require('./config')
const nodeArgs = process.argv.slice(2);

const devMode = nodeArgs.includes('--dev') ? true : false
const { NAME, TOKEN, CHAT_ID, LEECHERS, SPONSORS } = devMode ? telegramDev : telegram
console.log(`Attivato ${NAME}. Dev mode: ${devMode}.`)

const storesJsonLocation = devMode ? 'stores-dev.json' : 'stores.json';

//const rawStoresData = fs.readFileSync('stores.json')
const rawStoresData = fs.readFileSync(storesJsonLocation)
const targets = JSON.parse(rawStoresData);

(async () => {
    while (true) {
        const options = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu',
                '--disk-cache-size=0',
                '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
            ],
            headless: true
        }
        console.time('loop')
        const browser = await puppeteer.launch(options);
        const pages = await openEveryPages(browser, targets);
        for (const page of pages) {
            await page.close();
        }
        await browser.close();
        console.timeEnd('loop')
        //console.log('Pages ready. Start to fetch.')
        //let captcha = false
        //let firstLoading = true
    }
})();


const openEveryPages = async (browser, targets) => {
    for (let i = 0; i < targets.length; i++) {
        console.log(`Opening page ${i + 1} of ${targets.length}: ${targets[i].name}`);
        try {
            if (i == 0) {
                const pages = await browser.pages();
                await pages[0].setRequestInterception(true)

                pages[0].on('request', interceptedRequest => {
                    if (interceptedRequest.url().endsWith('.png') || interceptedRequest.url().endsWith('.jpg'))
                        interceptedRequest.abort();
                    else
                        interceptedRequest.continue();
                });

                console.time('open and scan')
                await pages[0].goto(targets[0].url, { waitUntil: 'domcontentloaded', timeout: 10000 })
                pages[0].available = targets[0].available
                pages[0].storeIndex = 0
                await scanPage(pages[0], targets[0])
                console.timeEnd('open and scan');
            } else {
                const page = await browser.newPage();

                await page.setRequestInterception(true)

                page.on('request', interceptedRequest => {
                    if (interceptedRequest.url().endsWith('.png') ||
                        interceptedRequest.url().endsWith('.jpg') ||
                        interceptedRequest.url().endsWith('.css'))
                        interceptedRequest.abort();
                    else
                        interceptedRequest.continue();
                });
                console.time('open and scan')
                await page.goto(targets[i].url, { waitUntil: 'domcontentloaded', timeout: 10000 })
                page.available = targets[i].available
                page.storeIndex = i
                await scanPage(page, targets[i]);
                console.timeEnd('open and scan')
            }
        } catch (error) {
            console.log(`Errore 1: ${error.message}`)
        }
    }
    const pages = await browser.pages();
    return pages;
}

const reloadEveryPages = async (pages, firstLoading) => {
    let i = 0
    for (const page of pages) {
        try {
            const target = targets[i];
            await page.setCacheEnabled(false)
            await page.bringToFront();

            console.log(`Scanning ${target.name}`)
            console.time('reload');
            !firstLoading
                ? await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 10000 })
                : false
            console.timeEnd('reload');
            await scanPage(page, target)
            await page.waitForTimeout(500)
        } catch (error) {
            console.error(`Errore 2: ${error.message}`)
        }
        i++
    }
    firstLoading = false
}

const scanPage = async (page, target) => {
    try {
        const amazonCaptcha = await page.$('#captchacharacters');
        if (amazonCaptcha != null) {
            // We got a captcha
            console.log(`${target.name} ha beccato il captcha. Provo a risolverlo...`)
            const amazonCaptchaImageUrl = await page.$eval(('.a-row img'), node => node.src);

            const captchaImageB64 = await imageToBase64(amazonCaptchaImageUrl)
            const captchaResponse = await solveCaptcha(captchaImageB64)

            await page.evaluate(async ({ captchaResponse }) => {

                console.log(`CaptchaResponse is: ${captchaResponse}`);

                document.querySelector('#captchacharacters').value = captchaResponse
                document.querySelector('form').submit()
            }, { captchaResponse })
        }

        const isAvailable = await page.$(target.selector);
        let price = 0
        if (isAvailable == null) {
            console.log(`${target.name} non disponibile`)
            if (page.available) {
                sendTelegramNotification(target, `${target.name} non più disponibile.`, true)
                page.available = false;
                updateStores(page.available, page.storeIndex)
            }
        } else {
            const priceElement = await page.$('#priceblock_ourprice');
            if (priceElement != null) {
                price = await page.evaluate(el => el.textContent, priceElement)
                price = parseInt(price.replace('.', ''))
            } else {
                price = 0
            }

            if (price < target.price && price > target.price - 10) {
                if (!page.available) {
                    sendTelegramNotification({ ...target, currentPrice: price })
                    console.log(`${target.name} disponibile: ${target.url}`)
                    page.available = true;
                    updateStores(page.available, page.storeIndex)
                }
            } else {
                console.log(`${target.name} disponibile ma prezzo troppo ${price < target.price ? 'basso' : 'alto'}: ${price}. Il prezzo giusto sarebbe tra ${target.price - 10} e ${target.price}`)
                if (page.available) {
                    sendTelegramNotification(target, `${target.name} non più disponibile.`, true)
                    page.available = false;
                    updateStores(page.available, page.storeIndex)
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
}

const updateStores = (stockStatus, storeIndex) => {
    targets[storeIndex].available = stockStatus
    fs.writeFile(storesJsonLocation, JSON.stringify(targets), (err) => {
        if (err) throw (err)
        console.log('JSON updated');
    })
}

const sendTelegramNotification = async (target, text = false, silent = false) => {
    try {
        const wunderfulMsg = `
*{AMAZON ${target.nation}}*
⚠️ *${target.name} è disponibile!!!* ⚠️
🛒 *Url: ${target.url}* 🛒`
        const forFreeMessage = `

@finallyHereNotify
_Vuoi ricevere gratuitamente le notifiche anche nel tuo gruppo? Clicca qui: https://forms.gle/SszjrQosT2cTMCSH6._
        `

        const message = text ? text : wunderfulMsg
        const forFreeUsersMessage = message + forFreeMessage

        const response = await fetch(encodeURI(`https://api.telegram.org/bot${TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${forFreeUsersMessage}&parse_mode=markdown&disable_notification=${silent}`))
        const data = await response.json();
        console.log(data);

        const { message_id } = data.result;
        LEECHERS.forEach(leech => {
            fetch(encodeURI(`https://api.telegram.org/bot${TOKEN}/forwardMessage?chat_id=${leech}&from_chat_id=${CHAT_ID}&message_id=${message_id}&parse_mode=markdown&disable_notification=${silent}`))
        })
        for (const sponsor of SPONSORS) {
            if (sponsor.products.includes(target.id)) {
                fetch(encodeURI(`https://api.telegram.org/bot${TOKEN}/sendMessage?chat_id=${sponsor.id}&text=${message}&parse_mode=markdown&disable_notification=${silent}`))
            }
        }
    } catch (error) {
        console.error(`Error: ${error}`)
    }
}

const solveCaptcha = async (base64) => {
    return new Promise(async (resolve, reject) => {
        let captchaSolution = '';
        const { data } = await axios({
            method: 'POST',
            url: 'http://2captcha.com/in.php',
            data: {
                method: 'base64',
                key: captchaAPI,
                body: base64,
                json: 1
            }
        })
        if (data.status) {
            const id = data.request
            let solved = 0;
            while (!solved) {
                const { data } = await axios({
                    method: 'GET',
                    url: `http://2captcha.com/res.php?action=get&json=1&key=${captchaAPI}&id=${id}`
                })
                if (data.status) {
                    solved = 1;
                    captchaSolution = data.request
                } else {
                    await sleep(1000)
                }
            }
            resolve(captchaSolution);
        }
    })
}

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
