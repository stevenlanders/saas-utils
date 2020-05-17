'use strict';

let AWS = require("aws-sdk")
let crypto = require("crypto")
const { v4: uuidv4 } = require('uuid');
let tenants = require("./api/lib/tenants")
var sp = new AWS.CognitoIdentityServiceProvider({apiVersion: '2016-04-18'});

const CLIENT_ID = process.env.clientId;
const USER_POOL_ID = process.env.userPoolId;
const USAGE_PLAN_ID = process.env.usagePlanId;
const REGION = process.env.region;

const attr = (name, value) => {
  return {
    Name: name,
    Value: value
  }
}

const errorResp = (code, message) => {
  return {
    statusCode: code,
    body: JSON.stringify({
      message: message,
    }),
  };
}

const toHtml = (obj) => {
  let keys = Object.keys(obj);
  let result = ""
  for(let i=0; i<keys.length; i++){
    let k = keys[i];
    let v = obj[k];
    result += `${k}: ${v}<br/>`
  }
  return result;
}

const sendEmailToSupport = async (user) => {
  // Create sendEmail params
  const params = {
    Destination: {
      ToAddresses: ["steven.landers@gmail.com"]
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: toHtml(user)
        }
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Citizen Data Signup: ${user.email}`
      }
    },
    Source: "support@citizendata.network"
  };
  await new AWS.SES({ apiVersion: "2010-12-01" }).sendEmail(params).promise();
}

const generatePassword = async () => {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(48, function(err, buffer) {
      resolve(buffer.toString('hex'));
    });
  })
}

const createApiKey = async (name) => {
  var apigateway = new AWS.APIGateway({region: REGION });

  let res = await apigateway.createApiKey({enabled: true, name: name}).promise();
  
  let params = {
    keyId: res.id,
    keyType: "API_KEY",
    usagePlanId: USAGE_PLAN_ID
  }

  apigateway.createUsagePlanKey()
  await apigateway.createUsagePlanKey(params).promise();
  return res;
}

const loginWithUser = async (username, password) => {
  var authParams = {
    USERNAME : username,
    PASSWORD : password,
  };

  let params = {
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID,
    AuthFlow: "ADMIN_NO_SRP_AUTH",
    AuthParameters: authParams
  }

  return await sp.adminInitiateAuth(params).promise();
}

const updatePassword = async (username, tempPass) => {
  let newPassword = await generatePassword();
  let challenge = await loginWithUser(username, tempPass);
  
  await sp.adminRespondToAuthChallenge({
    Session: challenge.Session, 
    ChallengeName: challenge.ChallengeName,
    ClientId: CLIENT_ID,
    UserPoolId: USER_POOL_ID,
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: newPassword
    }
  }).promise()
  return newPassword;
}

module.exports.postCreateAdminUser = async (event, context, callback) => {
  console.log(event);
  if(!event.request.userAttributes["custom:tenantId"]){
    let emailAddress = event.request.userAttributes["email"];
    let tenantId = await tenants.createNewTenant(emailAddress);
    await sp.adminUpdateUserAttributes({
      Username: event.userName,
      UserAttributes: [{Name: "custom:tenantId", Value: tenantId}],
      UserPoolId: USER_POOL_ID
    }).promise()

    // copy attributes and append tenantId
    let attrs = JSON.parse(JSON.stringify(event.request.userAttributes));
    attrs["custom:tenantId"] = tenantId;
    //TODO: configure email
    //await sendEmailToSupport(attrs)
  }
  callback(null, event);
}

module.exports.createAdminUser = async (event, context) => {
  if(!event.username) {
    return errorResp(400, "username is required");
  }
  if(!event.name){
    return errorResp(400, "name is required");
  }
  if(!event.email){
    return errorResp(400, "email is required");
  }
  if(!event.tenantId){
    return errorResp(400, "tenantId is required");
  }

  let attrs = [
    attr("name", event.name),
    attr("email", event.email),
    attr("custom:tenantId", event.tenantId)
  ]

  await sp.adminCreateUser({
    UserPoolId: USER_POOL_ID,
    Username: event.username,
    UserAttributes: attrs
  }).promise();
}

module.exports.createApiUser = async (event, context) => {
  if(!event.name){
    return errorResp(400, "name is required");
  }
  if(!event.email){
    return errorResp(400, "email is required");
  }
  if(!event.tenantId){
    return errorResp(400, "tenantId is required");
  }

  let username = uuidv4();
  let tempPass = await generatePassword();

  let apiKey = await createApiKey(event.email);

  let attrs = [
    attr("name", event.name),
    attr("email", event.email),
    attr("custom:tenantId", event.tenantId),
    attr("custom:apikey", apiKey.id)
  ]

  await sp.adminCreateUser({
    UserPoolId: USER_POOL_ID,
    Username: username,
    TemporaryPassword: tempPass,
    MessageAction: "SUPPRESS",
    UserAttributes: attrs
  }).promise();

  await sp.adminAddUserToGroup({
    GroupName: "admin", 
    Username: username, 
    UserPoolId: USER_POOL_ID
  }).promise();

  let password = await updatePassword(username, tempPass);

  return {
    apiKey: apiKey.value,
    id: username,
    secret: password
  }
  
  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};
