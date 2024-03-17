# llm-demo-multimodal
It is a demo using multimodal llm.

![image](https://github.com/kyopark2014/llm-demo-multimodal/assets/52392004/59a57a2c-6627-45f0-85b2-f0955a15a33f)


[Transcribing streaming audio](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)에서 가이드하는 Best Practice에 따라, PCM 방식을 사용하고, chunk size는 아래와 같습니다.

```text
chunk_size_in_bytes = chunk_duration_in_millisecond / 1000 * audio_sample_rate * 2
```


[StartStreamTranscription](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.html)


[Amazon Transcribe API](

[Amazon Transcribe Streaming SDK](https://github.com/awslabs/amazon-transcribe-streaming-sdk)
