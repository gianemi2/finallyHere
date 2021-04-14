# Finally Here Notify 

![Finally Here Logo](https://6emme.it/wp-content/uploads/2021/04/finally-here-img.jpg)

A super easy, and not well made, bot for a lot of shops notifications. 

[Donations](https://ko-fi.com/gianemi2)

## How to install
1. Clone this repository. `$ git clone https://github.com/gianemi2/finallyHere.git`
2. Move into the repository: `$ cd finallyHere`
3. Install every dependencies: `$ yarn`
4. Clone the examples configurations files: `cp config.example.js config.js & cp stores.example.json stores.json`

## Configuration
### Edit config.js

##### TOKEN AND CHAT ID
Insert your Telegram Bot Token and Telegram Chat ID. Don't know how to find those info? [Read here.](https://6emme.it/come-creare-un-bot-su-telegram/). 

##### LEECHERS AND SPONSORS

Useful if you want to send notifications to many other channels. 
* Leechers just get a forwarded message. 
* Sponsors get a real sent message. You can specify products id. 
Both fields need the *telegram chat ID* and your *telegram bot* must be admistrator of that channel. 

##### CAPTCHA API

Register on [2captcha.com](https://2captcha.com?from=11162377
) and get your API KEY. The captcha API is required for Amazon.

### Edit stores.json

Edit stores.json adding your desired shops. You should never change `selector` or `storeName`. If you want to add new products, just clone the object of the desired shop and replace everything except `selector` and `storeName`. 
Price is required only for Amazon products. Please leave it 1 euro more than the retail price. 

## Tests

You can clone `stores.example.json` renaming it `stores-dev.json`. 

Running `node index.js --dev` let you use `stores-dev` and `telegramDev` configurations on `config.js` file.

## Start

Just run `node index.js`. 