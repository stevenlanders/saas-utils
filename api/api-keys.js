'use strict';

let utils = require("./lib/utils")
let keyUtils = require("./lib/key-utils")
let tenants = require("./lib/tenants")

module.exports.createKey = async (event, context) => {
    let user = utils.getUser(event);
    let keyCount = await keyUtils.countKeys(user);
    let tenant = await tenants.getTenant(user.company);
    console.log(user);
    if(keyCount >= tenant.maxApiKeys) {
        console.log(`attempt to create more than ${tenant.maxApiKeys} keys...not allowing`)
        return utils.error(403, `Maximum number of keys (${tenant.maxApiKeys}) has been reached. Delete one to create another.`)
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