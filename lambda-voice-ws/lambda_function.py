import json
import boto3
import os
import time
import traceback
import base64
import redis
import uuid

# for Redis
redisAddress = os.environ.get('redisAddress')
print('redisAddress: ',redisAddress)
redisPort = os.environ.get('redisPort')
print('redisPort: ',redisPort)

def subscribe_redis(redis_client, channel):    
    pubsub = redis_client.pubsub()
    pubsub.subscribe(channel)
    print('successfully subscribed for channel: ', channel)    
            
    for message in pubsub.listen():
        print('message: ', message)
                
        if message['data'] != 1:            
            msg = message['data'].encode('utf-8').decode('unicode_escape')
            # msg = msg[1:len(msg)-1]
            print('voice msg: ', msg)    
                    
            #deliveryVoiceMessage(action_dict[userId], msg)
            deliveryVoiceMessage("general", msg)

def initiate_redis():
    global redis_client
    
    try: 
        redis_client = redis.Redis(host=redisAddress, port=redisPort, db=0, charset="utf-8", decode_responses=True)    
        print('Redis was connected')
        
    except Exception:
        err_msg = traceback.format_exc()
        print('error message: ', err_msg)                    
        raise Exception ("Not able to request to redis")        
    
initiate_redis()
       
# websocket
voice_connection_url = os.environ.get('voice_connection_url')
client = boto3.client('apigatewaymanagementapi', endpoint_url=voice_connection_url)
print('voice_connection_url: ', voice_connection_url)
    
def sendMessage(body):
    try:
        #print('post_to_connection')
        #print('connectionId: ', connectionId)
        #print('body: ', json.dumps(body))
        
        client.post_to_connection(
            ConnectionId=connectionId, 
            Data=json.dumps(body)
        )
    except Exception:
        err_msg = traceback.format_exc()
        print('err_msg: ', err_msg)
        raise Exception ("Not able to send a message")
    
def deliveryVoiceMessage(action, msg):    
    requestId = uuid.uuid4()
    print('requestId: ', requestId)
    result = {
        'request_id': str(requestId),
        'action': action,
        'msg': msg,
        'status': 'redirected'
    }
    print('result: ', json.dumps(result))
    
    sendMessage(result)      

isConnected = False        
def start_redis_pubsub(userId):
    print('start subscribing redis.')
    channel = userId 
    subscribe_redis(redis_client, channel)
                
def lambda_handler(event, context):
    #print('event: ', event)    
    global connectionId, isConnected
    
    msg = ""
    if event['requestContext']: 
        connectionId = event['requestContext']['connectionId']     
        print('connectionId', connectionId)   
        routeKey = event['requestContext']['routeKey']
        print('routeKey', routeKey)   
        
        if routeKey == '$connect':
            print('connected!')
        elif routeKey == '$disconnect':
            print('disconnected!')
        else:
            body = event.get("body", "")
            if body[0:8] == "__ping__":  # keep alive
                if isConnected == False:
                    start_redis_pubsub(userId)                
                    isConnected = True
                sendMessage("__pong__")
            else:  
                print('connectionId: ', connectionId)
                print('routeKey: ', routeKey)

                jsonBody = json.loads(body)
                print('request body: ', json.dumps(jsonBody))
                userId  = jsonBody['user_id']
                
                # for testing message
                #deliveryVoiceMessage("general", "hello world!")
                start_redis_pubsub(userId)                
                isConnected = True
                
    return {
        "isBase64Encoded": False,
        'statusCode': 200,
        'body': json.dumps({            
            "msg": 'success'
        })
    }    