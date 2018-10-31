'use strict';

let utils = require("./lib/utils")
let keyUtils = require("./lib/key-utils")

module.exports.createNvApiKey = async (event, context) => {
    let user = utils.getUser(event);
    let keyCount = await keyUtils.countKeys(user);
    console.log(user);
    if(keyCount >= 10) {
        console.log("attempt to create 11th key...not allowing")
        return utils.error(409, "Only 10 keys are allowed. Delete one to create another.")
    }
    let result = await keyUtils.createKey(user)
    return utils.success(result);
};

module.exports.getKeyList = async (event, context) => {
    let user = utils.getUser(event);
    let result = await keyUtils.getKeyList(user)
    return utils.success({
        keyList: result
    });
};

module.exports.getKey = async (event, context) => {
    let user = utils.getUser(event);
    let keyId = event.pathParameters.id;
    let result = await keyUtils.getKey(user, keyId)
    return utils.success(result);
};

module.exports.deleteKey = async (event, context) => {
    let user = utils.getUser(event);
    let keyId = event.pathParameters.id;
    await keyUtils.deleteKey(user, keyId)
    return utils.success({
        deleted: true
    });
};