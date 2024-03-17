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
            msg = msg[1:len(msg)-1]
            print('voice msg: ', msg)    
                    
            #deliveryVoiceMessage(action_dict[userId], msg)
            deliveryVoiceMessage("general", msg)
    """
    pubsub = redis_client.pubsub()
    pubsub.subscribe(channel)
    print('successfully subscribed for channel: ', channel)    
    
    for message in pubsub.listen():
        print('message: ', message)
        
        if message['data'] != 1:        
            msg = message['data'].encode('utf-8').decode('unicode_escape')
            print('voice msg: ', msg)    
            deliveryVoiceMessage(action_dict[channel], msg)
    """        
    """
    while True:
        for message in pubsub.listen():
            print('message: ', message)
            if  message['data'] !=1:
                msg = message['data']
                print('voice msg: ', msg)        
                deliveryVoiceMessage(action_dict['userId'], msg)              
                msg = message['data'].encode('utf-8').decode('unicode_escape')
                print('voice msg: ', msg)      
    """
                
                
    
    #while True:
    """
        print("waiting message...")
        
        try: 
            res = rs.get_message(timeout=5)
            if res is not None:
                print(f"res: {res}")
        except Exception:
            err_msg = traceback.format_exc()
            print('error message: ', err_msg)       
            raise Exception (f"Not able to connect redis")    
    """

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
connection_url = os.environ.get('connection_url')
client = boto3.client('apigatewaymanagementapi', endpoint_url=connection_url)
print('connection_url: ', connection_url)
    
def sendMessage(body):
    try:
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

def sendResultMessage(action, msg):    
    result = {
        'request_id': requestId,
        'action': action,
        'msg': msg,
        'status': 'completed'
    }
    #print('debug: ', json.dumps(debugMsg))
    sendMessage(result)
        
def sendErrorMessage(msg):
    errorMsg = {
        'request_id': requestId,
        'msg': msg,
        'status': 'error'
    }
    print('error: ', json.dumps(errorMsg))
    sendMessage(errorMsg)    
        
def lambda_handler(event, context):
    # print('event: ', event)    
    global connectionId, requestId
    
    msg = ""
    if event['requestContext']: 
        connectionId = event['requestContext']['connectionId']        
        routeKey = event['requestContext']['routeKey']
        
        if routeKey == '$connect':
            print('connected!')
            
            # for testing message
            #deliveryVoiceMessage("general", "hello world!")
            
            #print('start subscribing redis.')
            #channel = 'kyopark'    
            #subscribe_redis(redis_client, channel)
            
        elif routeKey == '$disconnect':
            print('disconnected!')
            
        else:
            body = event.get("body", "")
            #print("data[0:8]: ", body[0:8])
            if body[0:8] == "__ping__":
                # print("keep alive!")                
                sendMessage("__pong__")
            else:
                print('connectionId: ', connectionId)
                print('routeKey: ', routeKey)
        
                jsonBody = json.loads(body)
                print('request body: ', json.dumps(jsonBody))

                requestId  = jsonBody['request_id']
                try:                    
                    userId  = jsonBody['user_id']
                    print('userId: ', userId)
                                        
                    
                    
                except Exception:
                    err_msg = traceback.format_exc()
                    print('err_msg: ', err_msg)

                    sendErrorMessage(err_msg)    
                    raise Exception ("Not able to send a message")

    return {
        'statusCode': 200
    }