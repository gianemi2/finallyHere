const imageToBase64 = require('image-to-base64');
(async () => {
    const b64 = await imageToBase64('./Captcha_stoqtmukee.jpg')
    console.log(b64);
})()