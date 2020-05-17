'use strict'


const getUser = (event) => {
    let id = event.requestContext.authorizer;
    if(id.claims){
        id = id.claims;
    }

    let u = {
        id: id.sub,
        tenantId: id["custom:tenantId"],
        email: id.email
    }
    console.log(u);
    return u;
}

const success = (obj) => {
    return {
        statusCode: 200,
        body: JSON.stringify(obj),
        headers: {
            "Access-Control-Allow-Origin" : "*", 
            "Access-Control-Allow-Credentials" : true,
            "Content-Type": "application/json"
        }
      };
}

const error = (code, message) => {
    return {
        statusCode: code,
        body: JSON.stringify({
            message: message
        }),
        headers: {
            "Access-Control-Allow-Origin" : "*", 
            "Access-Control-Allow-Credentials" : true,
            "Content-Type": "application/json"
        }
      };
}

module.exports = {
    getUser: getUser,
    error: error,
    success: success
}