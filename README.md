# llm-demo-multimodal
It is a demo using multimodal llm.


[Transcribing streaming audio](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)에서 가이드하는 Best Practice에 따라, PCM 방식을 사용하고, chunk size는 아래와 같습니다.

```text
chunk_size_in_bytes = chunk_duration_in_millisecond / 1000 * audio_sample_rate * 2
```




[Amazon Transcribe API](
