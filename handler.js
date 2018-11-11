'use strict';

let AWS = require("aws-sdk")
let crypto = require("crypto")
let uuid = require("uuid/v4")
let tenants = require("./api/lib/tenants")
var sp = new AWS.CognitoIdentityServiceProvider({apiVersion: '2016-04-18'});

const CLIENT_ID = process.env.clientId;
const USER_POOL_ID = process.env.userPoolId;
const USAGE_PLAN_ID = process.env.usagePlanId;
const USER_TYPE = process.env.userType;
const REGION = process.env.region;

const isNetvote = () => {
  return USER_TYPE === "netvote";
}

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

module.exports.postCreateNetvoteAdminUser = async (event, context, callback) => {
  console.log(event);
  if(!event.request.userAttributes["custom:company"]){
    let emailAddress = event.request.userAttributes["email"];
    let tenantId = await tenants.createNewTenant(emailAddress);
    await sp.adminUpdateUserAttributes({
      Username: event.userName,
      UserAttributes: [{Name: "custom:company", Value: tenantId}],
      UserPoolId: USER_POOL_ID
    }).promise()
  }
  callback(null, event);
}

module.exports.createNetvoteAdminUser = async (event, context) => {
  if(!event.username) {
    return errorResp(400, "username is required");
  }
  if(!event.name){
    return errorResp(400, "name is required");
  }
  if(!event.email){
    return errorResp(400, "email is required");
  }
  if(!event.company){
    return errorResp(400, "company is required");
  }

  let attrs = [
    attr("name", event.name),
    attr("email", event.email),
    attr("custom:company", event.company)
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
  if(!event.company){
    return errorResp(400, "company is required");
  }

  let mainnet = event.mainnet || 0;

  let username = uuid();
  let tempPass = await generatePassword();

  let apiKey = await createApiKey(event.email);

  let attrs = [
    attr("name", event.name),
    attr("email", event.email),
    attr("custom:company", event.company),
    attr("custom:mainnet", `${mainnet}`),
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
