package service

import (
	"bytes"
	"mime/multipart"
	"net/textproto"
	"testing"
)

func TestModelRequestIntentFromProxyRequestJSON(t *testing.T) {
	intent := ModelRequestIntentFromProxyRequest("video", "application/json", []byte(`{"input":{"resolution":"480","duration":5,"images":["https://example.com/a.png"]}}`))
	if intent.Options["vquality"] != "480p" || intent.Options["videoSeconds"] != "5" || intent.Inputs["image"] != 1 {
		t.Fatalf("intent = %#v", intent)
	}
}

func TestModelRequestIntentFromProxyRequestMultipart(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, field := range []struct{ name, value string }{{"resolution", "1080p"}, {"seconds", "7"}} {
		part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="` + field.name + `"`}})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write([]byte(field.value)); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("not a real image")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	intent := ModelRequestIntentFromProxyRequest("video", writer.FormDataContentType(), body.Bytes())
	if intent.Options["vquality"] != "1080p" || intent.Options["videoSeconds"] != "7" || intent.Inputs["image"] != 1 {
		t.Fatalf("intent = %#v", intent)
	}
}
