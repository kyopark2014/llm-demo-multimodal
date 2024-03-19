import json
import boto3
import os

def lambda_handler(event, context):
    print('event: ', event)
    
    text = event['text']
    
    polly_client = boto3.client('polly')
    response = polly_client.synthesize_speech(
        Text=text,
        OutputFormat='mp3',
        VoiceId='Seoyeon'  # 한국어 음성 'Seoyeon' 사용
    )
    
    audio = response['AudioStream'].read()
    
    return {
        "isBase64Encoded": False,
        'statusCode': 200,
        'body': json.dumps({            
            "audio": audio
        })
    }    