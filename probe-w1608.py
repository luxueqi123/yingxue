path = 'probe-w1602.mjs'
s = open(path, encoding='utf-8').read()
marker = " ['231b95ec','56005e4c-c0e2-4229-8748-0a99d5f58cef'],['231b95ec','a5c26d32-1a5b-4857-af36-a5f1618b5bc1'],"
add = [
    "",
    " ['714c8ba7','2f636b52-6396-4a1b-94d0-a1927f0efb1f'],",
    " ['784f1408','11bb1b46-e6f4-45c3-9720-7d2ef02a5aaa'],['784f1408','b9c38756-e2cd-4619-91bb-147fb7aa78f1'],['784f1408','4ed5cb98-e588-44ef-acfb-fe1968213910'],",
    " ['992a0e82','479bbe32-a7e0-4248-afe0-5c615a1f9196'],",
    " ['d060cf7c','v-hciIIKiDYC'],['ec76b8b2','c2348bab-0695-46d0-88df-7023d5612e90'],",
    " ['cdd799b0','2624349e-d677-4f69-aaa7-e76e8fae982c'],['cdd799b0','dd724068-babe-4dae-a9cc-00ce6650f637'],['cdd799b0','f17d01cd-df20-4cc7-9645-6877e5f174cc'],['cdd799b0','f64963d1-6424-4fca-86d3-f615c3ffc55c'],",
]
assert marker in s
s = s.replace(marker, marker + '\n'.join(add))
open(path, 'w', encoding='utf-8').write(s)
print('ok', len(s))
