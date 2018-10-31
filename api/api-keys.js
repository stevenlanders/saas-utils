'use strict';

let utils = require("./lib/utils")
let keyUtils = require("./lib/key-utils")

module.exports.createNvApiKey = async (event, context) => {
    let user = utils.getUser(event);
    console.log(user);
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