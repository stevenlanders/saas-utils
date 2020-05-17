'use strict';

const utils = require("./lib/utils")
const tenants = require("./lib/tenants")

module.exports.get = async (event, context) => {

  try {
    const user = utils.getUser(event);
    let tenant = await tenants.getTenant(user.tenantId);
   
    if(!tenant) {
      return utils.error(404, "not found");
    }

    return utils.success(tenant)

  } catch (e) {
    return utils.error(400, e.message)
  }

};
