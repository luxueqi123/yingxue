package app

import "testing"

func TestTextResponseReferenceContract(t *testing.T) {
	input := canvasGenerationInput{Prompt: "按顺序分析参考素材", ReferenceImages: []providerMedia{{URL: "https://example.test/first.png"}, {URL: "https://example.test/second.png"}}, ReferenceVideos: []providerMedia{{URL: "https://example.test/motion.mp4"}}}
	content, err := textResponseContent(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(content) != 4 || content[0]["text"] != input.Prompt {
		t.Fatalf("prompt or reference lost: %#v", content)
	}
	if content[1]["type"] != "input_image" || content[1]["image_url"] != input.ReferenceImages[0].URL || content[2]["image_url"] != input.ReferenceImages[1].URL {
		t.Fatalf("image order changed: %#v", content)
	}
	if content[3]["type"] != "input_video" || content[3]["video_url"] != input.ReferenceVideos[0].URL {
		t.Fatalf("video missing: %#v", content)
	}
}
