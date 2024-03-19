import json
import boto3
from datetime import datetime

s3 = boto3.client('s3')
polly = boto3.client('polly')

def lambda_handler(event, context):
    
    if 'queryStringParameters' in event:
        if 'text' in event['queryStringParameters']:
            text = event['queryStringParameters']['text'] 
        if 'speed' in event['queryStringParameters']:
            speed = event['queryStringParameters']['speed']
        else:
            speed = '100'

    # 텍스트와 음성 옵션 설정
    text = f'<speak><prosody rate="{speed}%">{text}</prosody></speak>'
    voice_id = 'Seoyeon'
    output_format = 'mp3'
    
    # Polly로 음성 합성
    response = polly.synthesize_speech(
        Engine='neural',
        Text=text,
        OutputFormat=output_format,
        VoiceId=voice_id,
        TextType='ssml'
    )
    
    # S3 버킷과 키 설정
    timestamp = int(datetime.now().timestamp())
    bucket_name = 'ai-robot-0410'  # S3 버킷 이름
    object_key = f'speech_{timestamp}.mp3'  # MP3 파일 경로
    
    # 오디오 데이터를 S3에 업로드
    s3.put_object(
        Bucket=bucket_name,
        Key=object_key,
        Body=response['AudioStream'].read()
    )
    
    
    try:
        filepath = f"https://2azivsokn9.execute-api.us-west-2.amazonaws.com/default/item/{object_key}"
        return {
            "statusCode": 301,
            "headers": {'Location': filepath},
            "body": ""
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": str(e)
        }