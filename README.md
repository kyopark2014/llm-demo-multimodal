# Multimodel을 이용한 Robot Demo

여기에서는 Multimodal을 이용한 LLM Demo를 Robot을 이용해 구현하는것에 대해 설명합니다.

전체적인 Architecture는 아래를 참조하여 주시기 바랍니다. 

![image](./pictures/main_architecture.png)




## Voice Interpreter 

음성으로부터 Text를 추출합니다. 이때 [Amazon Transcribe Streaming SDK](https://github.com/awslabs/amazon-transcribe-streaming-sdk)을 활용하였습니다. 아래를 실행하기 전에 requirements를 설치합니다.

```text
pip install requirements.txt
```

interpreter 폴더로 이동하여, [config.ini](./interpreter/config.ini) 파일을 연 후에 아래의 내용을 업데이트 합니다.

```text
[system]
url = https://d3c6h2zak9z18h.cloudfront.net/redis
userId = kyopark
```

이후 아래와 같이 실행합니다.

```text
python mic_main.py
```

