import boto3
import os
import time
import re
import base64
import boto3
import uuid
import json
import redis
import traceback

# for Redis
redisAddress = os.environ.get('redisAddress')
redisPort = os.environ.get('redisPort')

try: 
    rd = redis.StrictRedis(host=redisAddress, port=redisPort, db=0)        
except Exception:
    err_msg = traceback.format_exc()
    print('error message: ', err_msg)                    
    raise Exception ("Not able to request to LLM")
    
def lambda_handler(event, context):
    print('event: ', json.dumps(event))
    
    userId = event['userId']    
    requestId = event['requestId']    
    query = event['query']
    state = event['state']    
        
    msg = {
        "userId": userId,
        "requestId": requestId,
        "query": query,
        "state": state
    }
    
    channel = f"{userId}"   
    try: 
        rd.publish(channel=channel, message=json.dumps(msg))
        print('successfully published: ', json.dumps(msg))
    
    except Exception:
        err_msg = traceback.format_exc()
        print('error message: ', err_msg)                    
        raise Exception ("Not able to request to LLM")
        
    msg = "success"
    
    return {
        "isBase64Encoded": False,
        'statusCode': 200,
        'body': json.dumps({ 
            "channel": channel,
            "query": json.dumps(query)
        })
    }