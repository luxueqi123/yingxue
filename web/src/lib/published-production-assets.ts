import communitySkills from "./community-skill-support.json";

// Source-matched packages. Model execution is verified separately from package completeness.
export const publishedSkills: Record<string, { cover: string; sourceTemplateId: string; aliases?: Record<string, string> }> = {
  ...Object.fromEntries(communitySkills.filter(item => item.packageComplete).map(item => [item.id, { cover: item.cover, sourceTemplateId: item.origin }])),
  "pl-d87519e1989d907b0453926e79dac057": {
    "cover": "/skill-covers/pl-d87519e1989d907b0453926e79dac057.webp",
    "sourceTemplateId": "c0a09eda8d114397a87541282e128cec",
    "aliases": {}
  },
  "pl-de0d4353d3c2b0deecfe99427fb04b6c": {
    "cover": "/skill-covers/pl-de0d4353d3c2b0deecfe99427fb04b6c.webp",
    "sourceTemplateId": "574f2608cf4a430eb5b1546dd60bcb29",
    "aliases": {
      "references/camera-language.md": "camera-language.md",
      "references/output-formats.md": "output-formats.md"
    }
  },
  "pl-de0577b75a9bce981b96b1a1a4da73c8": {
    "cover": "/skill-covers/pl-de0577b75a9bce981b96b1a1a4da73c8.webp",
    "sourceTemplateId": "53a34ef347704263b133ec6829078c52",
    "aliases": {}
  },
  "pl-fde4ccd6329d33f3322a89566ce7c291": {
    "cover": "/skill-covers/pl-fde4ccd6329d33f3322a89566ce7c291.webp",
    "sourceTemplateId": "00acc5d5ed42468d9fa24bb5b75a3217",
    "aliases": {}
  },
  "pl-046784244561e6f51d9fb9cbf2d878e3": {
    "cover": "/skill-covers/pl-046784244561e6f51d9fb9cbf2d878e3.webp",
    "sourceTemplateId": "0178a68ffe5b4776ab18827056595ccb",
    "aliases": {}
  },
  "pl-6751110332983a927db9e38a877ee22a": {
    "cover": "/production-library/editorial-covers/pl-6751110332983a927db9e38a877ee22a.webp",
    "sourceTemplateId": "029ef0b5ece645c491dde8c862263b1f",
    "aliases": {}
  },
  "pl-c4fc85ec95e1cb985d7e2287a4b3ff52": {
    "cover": "/skill-covers/pl-c4fc85ec95e1cb985d7e2287a4b3ff52.webp",
    "sourceTemplateId": "03ad0fbdb59a401d8f95d7b88a090479",
    "aliases": {}
  },
  "pl-6e8811ca98bf7f9bab27c1506b6c952b": {
    "cover": "/skill-covers/pl-6e8811ca98bf7f9bab27c1506b6c952b.webp",
    "sourceTemplateId": "03ffc490615c4202bdfb67edce2eb8d8",
    "aliases": {}
  },
  "pl-86dcba416d2f7c4019a1e6b9e492b4d1": {
    "cover": "/production-library/editorial-covers/pl-86dcba416d2f7c4019a1e6b9e492b4d1.webp",
    "sourceTemplateId": "051ccb509be44777b55ed602e6c43cbb",
    "aliases": {}
  },
  "pl-3efae1c6e4e3d6edb7691d274181f714": {
    "cover": "/skill-covers/pl-3efae1c6e4e3d6edb7691d274181f714.webp",
    "sourceTemplateId": "054577f83ca049a09d3b2d64a98eadb0",
    "aliases": {}
  },
  "pl-1cfd899055fb9e49108f4b0b45887940": {
    "cover": "/skill-covers/pl-1cfd899055fb9e49108f4b0b45887940.webp",
    "sourceTemplateId": "08710416354842e8a86e5b78e7009ad1",
    "aliases": {}
  },
  "pl-2387c5be56076d9f10a9275c8378b64a": {
    "cover": "/skill-covers/pl-2387c5be56076d9f10a9275c8378b64a.webp",
    "sourceTemplateId": "09524cce59a44b39abcc46fbdafe356f",
    "aliases": {}
  },
  "pl-a8b2ec139ad4943bb01a27290ae3f8b3": {
    "cover": "/skill-covers/pl-a8b2ec139ad4943bb01a27290ae3f8b3.webp",
    "sourceTemplateId": "09530dd10f4141f68ef7d9f008cd0308",
    "aliases": {}
  },
  "pl-5ba22fa547dc57f9101ded35c8b1ec12": {
    "cover": "/skill-covers/pl-5ba22fa547dc57f9101ded35c8b1ec12.webp",
    "sourceTemplateId": "096f6d97819748bcbbb6d4fd85313484",
    "aliases": {}
  },
  "pl-dbfb397a53ee5a14be56986c64064886": {
    "cover": "/skill-covers/pl-dbfb397a53ee5a14be56986c64064886.webp",
    "sourceTemplateId": "09b8ce45f11543c29331cf5cdbd2600b",
    "aliases": {}
  },
  "pl-f3917b6eae1adef75399986e82483820": {
    "cover": "/skill-covers/pl-f3917b6eae1adef75399986e82483820.webp",
    "sourceTemplateId": "09f39da6253d4df5823ed8d85513634f",
    "aliases": {}
  },
  "pl-91be394550da06a4268652790481f28f": {
    "cover": "/skill-covers/pl-91be394550da06a4268652790481f28f.webp",
    "sourceTemplateId": "0a794a1a4b584266b01e30d381b390ee",
    "aliases": {}
  },
  "pl-d0fc43270359e4928e872f8e21a015aa": {
    "cover": "/skill-covers/pl-d0fc43270359e4928e872f8e21a015aa.webp",
    "sourceTemplateId": "0b3307863f844bb4aeb9abb1c0405770",
    "aliases": {}
  },
  "pl-b62358bc4d4b7dd505d2d457a11fd01a": {
    "cover": "/skill-covers/pl-b62358bc4d4b7dd505d2d457a11fd01a.webp",
    "sourceTemplateId": "0b6520ef296940a09652a53a6113f93d",
    "aliases": {}
  },
  "pl-4fd4581449d84af257110b1a5893f66c": {
    "cover": "/skill-covers/pl-4fd4581449d84af257110b1a5893f66c.webp",
    "sourceTemplateId": "0ba812520f2e45d798945ccb96371afe",
    "aliases": {}
  },
  "pl-d51e9f2fe3672205bead0b99bba378ef": {
    "cover": "/production-library/editorial-covers/pl-d51e9f2fe3672205bead0b99bba378ef.webp",
    "sourceTemplateId": "0bc8a877f8004c738d2c526986e6be4c",
    "aliases": {}
  },
  "pl-6a5221a98ed155663685c25aafbc3ac4": {
    "cover": "/skill-covers/pl-6a5221a98ed155663685c25aafbc3ac4.webp",
    "sourceTemplateId": "0d902f99c974407a9ea29825ef7e772e",
    "aliases": {}
  },
  "pl-87f870536d5c14a448a1e05ea219ba20": {
    "cover": "/skill-covers/pl-87f870536d5c14a448a1e05ea219ba20.webp",
    "sourceTemplateId": "0da86f07472242849e090a2215260606",
    "aliases": {}
  },
  "pl-4906d57b42a3ab852e5e30ce08005cec": {
    "cover": "/skill-covers/pl-4906d57b42a3ab852e5e30ce08005cec.webp",
    "sourceTemplateId": "0e7bcaa0ee0e43d984f3e57927715e97",
    "aliases": {}
  },
  "pl-e4b2da0263b37cced128f3867ee925c7": {
    "cover": "/skill-covers/pl-e4b2da0263b37cced128f3867ee925c7.webp",
    "sourceTemplateId": "0eac5cb0c194436b9dee32e6ec109460",
    "aliases": {}
  },
  "pl-aa008befea38a466fa648c706cf8f337": {
    "cover": "/skill-covers/pl-aa008befea38a466fa648c706cf8f337.webp",
    "sourceTemplateId": "0ff2a6a7079043629bb896119b1c6775",
    "aliases": {}
  },
  "pl-1f365b2997daf7bf7767bc18511206f4": {
    "cover": "/skill-covers/pl-1f365b2997daf7bf7767bc18511206f4.webp",
    "sourceTemplateId": "116dd32360304c608100bdccb3d2d181",
    "aliases": {}
  },
  "pl-53636a0044d8dc0c2af9b4d6816ccc4b": {
    "cover": "/production-library/editorial-covers/pl-53636a0044d8dc0c2af9b4d6816ccc4b.webp",
    "sourceTemplateId": "11c69b26e91a4d77a6bc7ce4ff2ce426",
    "aliases": {}
  },
  "pl-88092da5211b362df7c5d4d976d1aa01": {
    "cover": "/skill-covers/pl-88092da5211b362df7c5d4d976d1aa01.webp",
    "sourceTemplateId": "11cb8a209d784b36b7cc802025a1238d",
    "aliases": {}
  },
  "pl-8a87f66dee4ba50074c84c5f2dfa5f25": {
    "cover": "/skill-covers/pl-8a87f66dee4ba50074c84c5f2dfa5f25.webp",
    "sourceTemplateId": "128976d3445d4f2190b0588d27022068",
    "aliases": {}
  },
  "pl-b20950615115aee20b3310bfbe7290b0": {
    "cover": "/skill-covers/pl-b20950615115aee20b3310bfbe7290b0.webp",
    "sourceTemplateId": "13a32aed299547bc9903fd677c110d10",
    "aliases": {}
  },
  "pl-08a407f80efcfb1f1858ead8f60768ca": {
    "cover": "/skill-covers/pl-08a407f80efcfb1f1858ead8f60768ca.webp",
    "sourceTemplateId": "14e7bc90e0fa4489ac2776a24846bb85",
    "aliases": {}
  },
  "pl-eb47eb52180c6b073b7d00c157dcb8b1": {
    "cover": "/skill-covers/pl-eb47eb52180c6b073b7d00c157dcb8b1.webp",
    "sourceTemplateId": "15bf645e79f04cb586e35bfc219cebbf",
    "aliases": {}
  },
  "pl-ec8e8394eff13b0cbca3831fbbc2a7cb": {
    "cover": "/production-library/editorial-covers/pl-ec8e8394eff13b0cbca3831fbbc2a7cb.webp",
    "sourceTemplateId": "16eaa0b1bc37413892d4c0ca33688fea",
    "aliases": {}
  },
  "pl-0d15ba0416111bd88ec35d69c324ec66": {
    "cover": "/skill-covers/pl-0d15ba0416111bd88ec35d69c324ec66.webp",
    "sourceTemplateId": "178c17fc9dc74b9288b980b3a7716314",
    "aliases": {}
  },
  "pl-8afc36eb85a79edc71ee65ab9cccf67e": {
    "cover": "/skill-covers/pl-8afc36eb85a79edc71ee65ab9cccf67e.webp",
    "sourceTemplateId": "17ea398b5bdf4701858dd8c6963838a1",
    "aliases": {}
  },
  "pl-ccf435f7509a33cc3d5dd9b8bfc98961": {
    "cover": "/skill-covers/pl-ccf435f7509a33cc3d5dd9b8bfc98961.webp",
    "sourceTemplateId": "18451a4029c24291a7922153ca736364",
    "aliases": {}
  },
  "pl-b0fed429241fca78d8cfd0147508f564": {
    "cover": "/skill-covers/pl-b0fed429241fca78d8cfd0147508f564.webp",
    "sourceTemplateId": "1953634132c5477d8f3ed0d43d43426c",
    "aliases": {}
  },
  "pl-fcd61aa413d7e1300487189bbc1a5cbb": {
    "cover": "/skill-covers/pl-fcd61aa413d7e1300487189bbc1a5cbb.webp",
    "sourceTemplateId": "19941bbd9dd246d184f61bb7efacafda",
    "aliases": {}
  },
  "pl-3788ae503c6801a84d0b55f55b329995": {
    "cover": "/skill-covers/pl-3788ae503c6801a84d0b55f55b329995.webp",
    "sourceTemplateId": "1a4c2fd858f2441d97f41c85718f80d4",
    "aliases": {}
  },
  "pl-a9f9242c0b1b07ea8797f3d1f391508e": {
    "cover": "/skill-covers/pl-a9f9242c0b1b07ea8797f3d1f391508e.webp",
    "sourceTemplateId": "1bdcd0f5acb54412afbdb753a62d52e5",
    "aliases": {}
  },
  "pl-c09e753573e82f38902e20ee4dc86f23": {
    "cover": "/skill-covers/pl-c09e753573e82f38902e20ee4dc86f23.webp",
    "sourceTemplateId": "1be747b153af43988fb4e0da1b56a638",
    "aliases": {}
  },
  "pl-95688240b19102a743fb5abfa42af46c": {
    "cover": "/skill-covers/pl-95688240b19102a743fb5abfa42af46c.webp",
    "sourceTemplateId": "1bf26729a9954c50874b912e6e46c734",
    "aliases": {}
  },
  "pl-ac083c85f6f2ff0efcaa2b2bbf77d43c": {
    "cover": "/skill-covers/pl-ac083c85f6f2ff0efcaa2b2bbf77d43c.webp",
    "sourceTemplateId": "1c47e08e1b8b4f7e93521b940c8bab85",
    "aliases": {}
  },
  "pl-c8009696904e5e3bc2333749753ebf39": {
    "cover": "/skill-covers/pl-c8009696904e5e3bc2333749753ebf39.webp",
    "sourceTemplateId": "1cd91487cf354911a0d0309403cadeff",
    "aliases": {}
  },
  "pl-e21d9c67391fddbc29f1ca8a221a7233": {
    "cover": "/skill-covers/pl-e21d9c67391fddbc29f1ca8a221a7233.webp",
    "sourceTemplateId": "1d736395ca4c498aa92be113bfaa7d1c",
    "aliases": {}
  },
  "pl-b9fcd97dd0ab448ea2bf1e419641ac35": {
    "cover": "/skill-covers/pl-b9fcd97dd0ab448ea2bf1e419641ac35.webp",
    "sourceTemplateId": "1df0e7955eba465e8afb5858a3a8cd86",
    "aliases": {}
  },
  "pl-5ea904f47cf81fc2eb490091ef123418": {
    "cover": "/skill-covers/pl-5ea904f47cf81fc2eb490091ef123418.webp",
    "sourceTemplateId": "1e446be102884668950d93f80dba0ff9",
    "aliases": {}
  },
  "pl-cca0d99931d6759a1ecaf88d717c09a3": {
    "cover": "/skill-covers/pl-cca0d99931d6759a1ecaf88d717c09a3.webp",
    "sourceTemplateId": "1f1d6a8d706f4a92bbf420c4567513c4",
    "aliases": {}
  },
  "pl-f65696fe56f77dbba5e9d1502ab4f538": {
    "cover": "/skill-covers/pl-f65696fe56f77dbba5e9d1502ab4f538.webp",
    "sourceTemplateId": "200f3f26eb614f4d9ea237993c172495",
    "aliases": {}
  },
  "pl-4fa0b6a7f3febbd7f34d1d074ad17bbc": {
    "cover": "/skill-covers/pl-4fa0b6a7f3febbd7f34d1d074ad17bbc.webp",
    "sourceTemplateId": "218f4d8f000a4af5bac42aa2a816c3ac",
    "aliases": {}
  },
  "pl-17d64825ef005f2b1dccdbeebbce410a": {
    "cover": "/skill-covers/pl-17d64825ef005f2b1dccdbeebbce410a.webp",
    "sourceTemplateId": "2247c88d1ecc496abdd7d8246eead1bb",
    "aliases": {}
  },
  "pl-365f91d4c1c3bd49232d43a24b7e32a4": {
    "cover": "/skill-covers/pl-365f91d4c1c3bd49232d43a24b7e32a4.webp",
    "sourceTemplateId": "2248e8aab1bd4d14ad22a0ca1b5cb3fc",
    "aliases": {}
  },
  "pl-7b7a945eb8cacf5b435bd3424bd25fe5": {
    "cover": "/skill-covers/pl-7b7a945eb8cacf5b435bd3424bd25fe5.webp",
    "sourceTemplateId": "229a73215b2140bfbdd420367887edb7",
    "aliases": {}
  },
  "pl-ba2ff90e5b811c0a1ef5fcddc1f87afc": {
    "cover": "/skill-covers/pl-ba2ff90e5b811c0a1ef5fcddc1f87afc.webp",
    "sourceTemplateId": "22b30b733af64fc19d7f9fd205ea8877",
    "aliases": {}
  },
  "pl-17bd8e77f88103d07f210b830159e4ca": {
    "cover": "/skill-covers/pl-17bd8e77f88103d07f210b830159e4ca.webp",
    "sourceTemplateId": "23519456424647738cbc663fbfb853d7",
    "aliases": {}
  },
  "pl-e4f9441c6b636fa2b3523e85cf1eb95f": {
    "cover": "/skill-covers/pl-e4f9441c6b636fa2b3523e85cf1eb95f.webp",
    "sourceTemplateId": "2355a6fbda9340bba9e59173688fa67d",
    "aliases": {}
  },
  "pl-42f88ad806ad26ee3c56b8030b2c7952": {
    "cover": "/skill-covers/pl-42f88ad806ad26ee3c56b8030b2c7952.webp",
    "sourceTemplateId": "2373ac9872484687b1aab088a160fe32",
    "aliases": {}
  },
  "pl-b604868b69977fb5b8268055333f8e6c": {
    "cover": "/skill-covers/pl-b604868b69977fb5b8268055333f8e6c.webp",
    "sourceTemplateId": "23a9589ffd854b0784e1a12be11ec680",
    "aliases": {}
  },
  "pl-9da2285d4f0ce43f84734e0e34a79f7d": {
    "cover": "/skill-covers/pl-9da2285d4f0ce43f84734e0e34a79f7d.webp",
    "sourceTemplateId": "2403ea35066948ab9cfdcc1ecdad3d79",
    "aliases": {}
  },
  "pl-7a4d6f506e6fdc3e292321a3137880f7": {
    "cover": "/production-library/editorial-covers/pl-7a4d6f506e6fdc3e292321a3137880f7.webp",
    "sourceTemplateId": "24b7449208e74894bbe998955df47e1f",
    "aliases": {}
  },
  "pl-c3ac95c7ab390c619f4a7b91417bcfd0": {
    "cover": "/skill-covers/pl-c3ac95c7ab390c619f4a7b91417bcfd0.webp",
    "sourceTemplateId": "253f71ea4d9f48f59e7e86ce34a95f7b",
    "aliases": {}
  },
  "pl-8499bd7703530d075b790cb9de64b86d": {
    "cover": "/production-library/editorial-covers/pl-8499bd7703530d075b790cb9de64b86d.webp",
    "sourceTemplateId": "25448b3671224560918e853f6b0071a0",
    "aliases": {}
  },
  "pl-441bf93fa1cc6180ae5a8bce86d8a2a4": {
    "cover": "/skill-covers/pl-441bf93fa1cc6180ae5a8bce86d8a2a4.webp",
    "sourceTemplateId": "25508606f3824b3f859e8e0d29cd3c51",
    "aliases": {}
  },
  "pl-1815e7313ee3b2e63bbdb4e9820e93dc": {
    "cover": "/skill-covers/pl-1815e7313ee3b2e63bbdb4e9820e93dc.webp",
    "sourceTemplateId": "2566954f9ee94b29b78cea90f96699cd",
    "aliases": {}
  },
  "pl-bf434478bae7f3dbc960cf6324ec3a8c": {
    "cover": "/skill-covers/pl-bf434478bae7f3dbc960cf6324ec3a8c.webp",
    "sourceTemplateId": "26162cc1470d4b8392e025b0ad1f15d5",
    "aliases": {}
  },
  "pl-9a6ebb25137014cad780fe419fb783e8": {
    "cover": "/skill-covers/pl-9a6ebb25137014cad780fe419fb783e8.webp",
    "sourceTemplateId": "2658177ea3bd4f4ba33f2374a39aaab5",
    "aliases": {}
  },
  "pl-3d3a5ba4fde94a3e5b1052e6b694a668": {
    "cover": "/skill-covers/pl-3d3a5ba4fde94a3e5b1052e6b694a668.webp",
    "sourceTemplateId": "269b70692f03460b9a33285f44544e6d",
    "aliases": {}
  },
  "pl-50e2be57a3dfd6c1a859a4c1ffac894b": {
    "cover": "/skill-covers/pl-50e2be57a3dfd6c1a859a4c1ffac894b.webp",
    "sourceTemplateId": "26eccb3214c2491881fc5e4b126baeac",
    "aliases": {}
  },
  "pl-fa1f91bc3c7fe2f1c35528b998de9e86": {
    "cover": "/skill-covers/pl-fa1f91bc3c7fe2f1c35528b998de9e86.webp",
    "sourceTemplateId": "2792faa219f3462890195cc6685e5193",
    "aliases": {}
  },
  "pl-9deaae98cac1238687a51123d67f7423": {
    "cover": "/skill-covers/pl-9deaae98cac1238687a51123d67f7423.webp",
    "sourceTemplateId": "27d9319c941941f9a4f3b771ce357560",
    "aliases": {}
  },
  "pl-d6ecd73090051f7635e866813d4a0dd9": {
    "cover": "/skill-covers/pl-d6ecd73090051f7635e866813d4a0dd9.webp",
    "sourceTemplateId": "29f9ac76048b4e449f25c4f5123b2bfd",
    "aliases": {}
  },
  "pl-81bab4f1ccd53e868ea2ca27f46cabd5": {
    "cover": "/skill-covers/pl-81bab4f1ccd53e868ea2ca27f46cabd5.webp",
    "sourceTemplateId": "2a7d2b69465344a5ad55d77c625d6f7c",
    "aliases": {}
  },
  "pl-e0596f7b80ecf4c2c728ff5100fa4fc9": {
    "cover": "/skill-covers/pl-e0596f7b80ecf4c2c728ff5100fa4fc9.webp",
    "sourceTemplateId": "2b8c9cd9f03a4f408b048ac207485877",
    "aliases": {}
  },
  "pl-4155fb099d20a7eb357c53071973d2f1": {
    "cover": "/skill-covers/pl-4155fb099d20a7eb357c53071973d2f1.webp",
    "sourceTemplateId": "2c49f61bcd3e413888b6bcb2a6f6a768",
    "aliases": {}
  },
  "pl-2844bb7d72f7a69663baa1edf0019d07": {
    "cover": "/skill-covers/pl-2844bb7d72f7a69663baa1edf0019d07.webp",
    "sourceTemplateId": "2cb95acf00e34b53a100c0226a6f4758",
    "aliases": {}
  },
  "pl-17b52de75554441740d4fbe3ad6e81c1": {
    "cover": "/production-library/editorial-covers/pl-17b52de75554441740d4fbe3ad6e81c1.webp",
    "sourceTemplateId": "2cc15ef6a2df4c6e921d1bed2f6ad1e2",
    "aliases": {}
  },
  "pl-0ad4d982715b406752531f52cc256ac5": {
    "cover": "/skill-covers/pl-0ad4d982715b406752531f52cc256ac5.webp",
    "sourceTemplateId": "2d9a07edefeb42309a188c0b7fe17bae",
    "aliases": {}
  },
  "pl-3f8ab0be7de4945bae29b17cf354e46a": {
    "cover": "/skill-covers/pl-3f8ab0be7de4945bae29b17cf354e46a.webp",
    "sourceTemplateId": "2e1f466c7b164a0c9ba5f1f966cd25e9",
    "aliases": {}
  },
  "pl-34676954ca9f98c5c379869228e06598": {
    "cover": "/skill-covers/pl-34676954ca9f98c5c379869228e06598.webp",
    "sourceTemplateId": "2f3ef2b9327841119f3f2596884e61d0",
    "aliases": {}
  },
  "pl-432034edc31b60fd14ca2b95a7e56615": {
    "cover": "/skill-covers/pl-432034edc31b60fd14ca2b95a7e56615.webp",
    "sourceTemplateId": "2fe131fada1e4a1ebee05f07fa126c61",
    "aliases": {}
  },
  "pl-7dee0430c9c1f3169bdfd953b4e8b4a3": {
    "cover": "/skill-covers/pl-7dee0430c9c1f3169bdfd953b4e8b4a3.webp",
    "sourceTemplateId": "3145303e53f1482ea9403195a0f25480",
    "aliases": {}
  },
  "pl-badfb68b6eeba5ce96815ad3f15efd12": {
    "cover": "/skill-covers/pl-badfb68b6eeba5ce96815ad3f15efd12.webp",
    "sourceTemplateId": "31d5577085414107836244f73ddd3462",
    "aliases": {}
  },
  "pl-2e92404cf0a769b464a261dfeab00f79": {
    "cover": "/skill-covers/pl-2e92404cf0a769b464a261dfeab00f79.webp",
    "sourceTemplateId": "3254301da66f4630881abf32447ffe38",
    "aliases": {}
  },
  "pl-a9ac2c3e0adb74df7e45b7cf93941d06": {
    "cover": "/skill-covers/pl-a9ac2c3e0adb74df7e45b7cf93941d06.webp",
    "sourceTemplateId": "33258dd7756046e79bf6283347f1243e",
    "aliases": {}
  },
  "pl-7ba6d414baa14496b85de5d6611dfc9b": {
    "cover": "/skill-covers/pl-7ba6d414baa14496b85de5d6611dfc9b.webp",
    "sourceTemplateId": "334b2ce400a64313b0e49a4635cd75b1",
    "aliases": {
      "references/libtv-publish.md": "纸片人规范/libtv-publish.md",
      "references/prompt-templates.md": "纸片人规范/prompt-templates.md"
    }
  },
  "pl-d2f93af2b14b66e322a3f22e7fa1f8c4": {
    "cover": "/skill-covers/pl-d2f93af2b14b66e322a3f22e7fa1f8c4.webp",
    "sourceTemplateId": "33b24a9c90eb40579ea3389d70c1a402",
    "aliases": {}
  },
  "pl-7ece2021527fbcfb3b22742863a4c7c3": {
    "cover": "/skill-covers/pl-7ece2021527fbcfb3b22742863a4c7c3.webp",
    "sourceTemplateId": "33b56ec0cb144594b480adca6ef4ce3a",
    "aliases": {}
  },
  "pl-4694a8c5b595cc61d588f6ef04ee1cbf": {
    "cover": "/production-library/editorial-covers/pl-4694a8c5b595cc61d588f6ef04ee1cbf.webp",
    "sourceTemplateId": "3590c81167224ce9a63b8bae058aa1a7",
    "aliases": {}
  },
  "pl-64fd54e8c027ab2655239c389cc94187": {
    "cover": "/skill-covers/pl-64fd54e8c027ab2655239c389cc94187.webp",
    "sourceTemplateId": "359337a152404d1d9119b1b54a37cfff",
    "aliases": {}
  },
  "pl-dbfe3f13f7b8690d50080eaeb15d1df4": {
    "cover": "/skill-covers/pl-dbfe3f13f7b8690d50080eaeb15d1df4.webp",
    "sourceTemplateId": "37a7929ce131454daa668f75ceb757d0",
    "aliases": {}
  },
  "pl-14d99c62ca1eeb1c24c6a8dd592a6f9d": {
    "cover": "/skill-covers/pl-14d99c62ca1eeb1c24c6a8dd592a6f9d.webp",
    "sourceTemplateId": "37e38c447ab2425e8bfcde6a98474766",
    "aliases": {}
  },
  "pl-121576b94aecc52debc3cd5b4356ccfc": {
    "cover": "/skill-covers/pl-121576b94aecc52debc3cd5b4356ccfc.webp",
    "sourceTemplateId": "38746e0ef46746008bf97f591ff0769b",
    "aliases": {}
  },
  "pl-e8549db22b1478635050a7077cd21ac9": {
    "cover": "/skill-covers/pl-e8549db22b1478635050a7077cd21ac9.webp",
    "sourceTemplateId": "3a0aa0425e964f419b03747388d111a4",
    "aliases": {}
  },
  "pl-bcc680feb2cfd151b04177d722f0cdf3": {
    "cover": "/skill-covers/pl-bcc680feb2cfd151b04177d722f0cdf3.webp",
    "sourceTemplateId": "3a6aebba44ba48cbbb45c68926a48a9d",
    "aliases": {}
  },
  "pl-469fb5bd72df95037c42d1b88d489abe": {
    "cover": "/skill-covers/pl-469fb5bd72df95037c42d1b88d489abe.webp",
    "sourceTemplateId": "3b163a994b0149b18517923723169c11",
    "aliases": {}
  },
  "pl-280a7ca3723913b81e363895a656cf4e": {
    "cover": "/skill-covers/pl-280a7ca3723913b81e363895a656cf4e.webp",
    "sourceTemplateId": "3ec06256f1144dfd9628ef3b6d53c7a7",
    "aliases": {}
  },
  "pl-8e62bd56163f383952b6d092c84c937a": {
    "cover": "/skill-covers/pl-8e62bd56163f383952b6d092c84c937a.webp",
    "sourceTemplateId": "3f59e2570dee402d93ebf663f0abadbe",
    "aliases": {}
  },
  "pl-3557273372f0d2f0017ada32da12b449": {
    "cover": "/skill-covers/pl-3557273372f0d2f0017ada32da12b449.webp",
    "sourceTemplateId": "404b846235fd4a39a45c01118090e533",
    "aliases": {}
  },
  "pl-9693cde05e232a01e06f1be50cd1b245": {
    "cover": "/skill-covers/pl-9693cde05e232a01e06f1be50cd1b245.webp",
    "sourceTemplateId": "41208a9b56f848bf803fa91c5b178bce",
    "aliases": {}
  },
  "pl-8db2fed4f109c3206b3d564374068d39": {
    "cover": "/skill-covers/pl-8db2fed4f109c3206b3d564374068d39.webp",
    "sourceTemplateId": "417344e1e20449f689c3979aac5a16ce",
    "aliases": {}
  },
  "pl-ab805aca14e8c24cc3203936cf76fe5e": {
    "cover": "/skill-covers/pl-ab805aca14e8c24cc3203936cf76fe5e.webp",
    "sourceTemplateId": "42a40ca1f404467fa7c40aaae2ac2551",
    "aliases": {}
  },
  "pl-8c793a2549a48d67ff084c333cbbce74": {
    "cover": "/skill-covers/pl-8c793a2549a48d67ff084c333cbbce74.webp",
    "sourceTemplateId": "43cd8da878e842d98ce5e4ce2f3dcbb1",
    "aliases": {}
  },
  "pl-40ba34b268008c0d7e4af54afd9ddb60": {
    "cover": "/skill-covers/pl-40ba34b268008c0d7e4af54afd9ddb60.webp",
    "sourceTemplateId": "442f9964cc9044c09369e29dcab8d398",
    "aliases": {}
  },
  "pl-db8e14a6d197abefaadf6ce5c5059405": {
    "cover": "/skill-covers/pl-db8e14a6d197abefaadf6ce5c5059405.webp",
    "sourceTemplateId": "4454056f3b4a4d7f9c2ca471c966e7d9",
    "aliases": {}
  },
  "pl-42b4b860ec8dc16b76710051c1dd5496": {
    "cover": "/skill-covers/pl-42b4b860ec8dc16b76710051c1dd5496.webp",
    "sourceTemplateId": "4565677ea43445e5a6a4d4d587084edb",
    "aliases": {}
  },
  "pl-86386e52ff5106bad12fe2e80df4a420": {
    "cover": "/skill-covers/pl-86386e52ff5106bad12fe2e80df4a420.webp",
    "sourceTemplateId": "464d5bb1efa841108782763d9b0c332b",
    "aliases": {}
  },
  "pl-2ad7362cce6710a198bd19725ae0e8b0": {
    "cover": "/skill-covers/pl-2ad7362cce6710a198bd19725ae0e8b0.webp",
    "sourceTemplateId": "46cae52592c542b8bdd46d01ab62e49b",
    "aliases": {}
  },
  "pl-a1f6590e201685a5890b60b02d35af07": {
    "cover": "/skill-covers/pl-a1f6590e201685a5890b60b02d35af07.webp",
    "sourceTemplateId": "46d7abbca3f14894b056dee49ae380a2",
    "aliases": {}
  },
  "pl-99eaf87e9b51c65cb6dd04d9eee9ff08": {
    "cover": "/production-library/editorial-covers/pl-99eaf87e9b51c65cb6dd04d9eee9ff08.webp",
    "sourceTemplateId": "47024db07fe441dc9f20f3748d90ddac",
    "aliases": {}
  },
  "pl-70b91181523989d99703332332776631": {
    "cover": "/skill-covers/pl-70b91181523989d99703332332776631.webp",
    "sourceTemplateId": "472b9891b7e8410792b8aaf79ec3e4d6",
    "aliases": {}
  },
  "pl-162a95e7cb3637027ca76e39225ded15": {
    "cover": "/skill-covers/pl-162a95e7cb3637027ca76e39225ded15.webp",
    "sourceTemplateId": "47c148df3a084e88b7041805eefda2c5",
    "aliases": {}
  },
  "pl-27c8dfeee9a8d55f49c274970ace963b": {
    "cover": "/skill-covers/pl-27c8dfeee9a8d55f49c274970ace963b.webp",
    "sourceTemplateId": "48c2df9bd9ff4da99a824f184669ee7f",
    "aliases": {}
  },
  "pl-d3bf427d51583f213484635e7dcc7e27": {
    "cover": "/skill-covers/pl-d3bf427d51583f213484635e7dcc7e27.webp",
    "sourceTemplateId": "4971a909d9744ba39c1eddf56ee6ae38",
    "aliases": {}
  },
  "pl-9bc1370557d905f049087b80d250534d": {
    "cover": "/skill-covers/pl-9bc1370557d905f049087b80d250534d.webp",
    "sourceTemplateId": "49e034e639d94ffcb6bf087b7ccecfc2",
    "aliases": {}
  },
  "pl-659f9d76a2b1022f4708ab48c47a193f": {
    "cover": "/skill-covers/pl-659f9d76a2b1022f4708ab48c47a193f.webp",
    "sourceTemplateId": "4a1cf5bbccf7445e81f87cb0a107a394",
    "aliases": {}
  },
  "pl-efe424610864a9c12ca6b2ed07b9ed83": {
    "cover": "/skill-covers/pl-efe424610864a9c12ca6b2ed07b9ed83.webp",
    "sourceTemplateId": "4aa01837b9504a6e9996b7d10a31bbb1",
    "aliases": {}
  },
  "pl-3d160cae0fb597e2fd5ac645ca758f85": {
    "cover": "/skill-covers/pl-3d160cae0fb597e2fd5ac645ca758f85.webp",
    "sourceTemplateId": "4b2404773145456ba8c11809e6d3a9ae",
    "aliases": {}
  },
  "pl-ffb62156f4512d83845a86ea2fc8856b": {
    "cover": "/skill-covers/pl-ffb62156f4512d83845a86ea2fc8856b.webp",
    "sourceTemplateId": "4b8e42fb7ef04c3091df99e5e3177389",
    "aliases": {}
  },
  "pl-539050ee92896421b2bbb9d1a07776a2": {
    "cover": "/skill-covers/pl-539050ee92896421b2bbb9d1a07776a2.webp",
    "sourceTemplateId": "4c01de70592c416b8d2667bcdc68cfd2",
    "aliases": {}
  },
  "pl-a26c5bc3625947c26a321cd2ecf64b4d": {
    "cover": "/production-library/editorial-covers/pl-a26c5bc3625947c26a321cd2ecf64b4d.webp",
    "sourceTemplateId": "4c4f70078e4a42d1b6851fd525a22195",
    "aliases": {}
  },
  "pl-eff8e02250d4566f7d932f1873ac3b98": {
    "cover": "/skill-covers/pl-eff8e02250d4566f7d932f1873ac3b98.webp",
    "sourceTemplateId": "4d64c7c83d8e406ba120ad349aee7173",
    "aliases": {}
  },
  "pl-a3ecae3eb4633b792274ad24de7baca0": {
    "cover": "/skill-covers/pl-a3ecae3eb4633b792274ad24de7baca0.webp",
    "sourceTemplateId": "4d66290bf1614583a419b505a22cd0f9",
    "aliases": {}
  },
  "pl-ecb71c850f10ab52aa64245502a0e652": {
    "cover": "/skill-covers/pl-ecb71c850f10ab52aa64245502a0e652.webp",
    "sourceTemplateId": "4e3db28938c04e619c15a6545b785fef",
    "aliases": {}
  },
  "pl-7f3ef8b42b43498e55b6d68b1ab607e2": {
    "cover": "/skill-covers/pl-7f3ef8b42b43498e55b6d68b1ab607e2.webp",
    "sourceTemplateId": "4e732b66e4034c5c95f30dcb5d526323",
    "aliases": {}
  },
  "pl-dd3450398b857116d0a811bae98445ed": {
    "cover": "/skill-covers/pl-dd3450398b857116d0a811bae98445ed.webp",
    "sourceTemplateId": "4ea0742a37074158894fc8e6c1a22223",
    "aliases": {}
  },
  "pl-4469fe9bd437e8429ba78e9d057c0621": {
    "cover": "/skill-covers/pl-4469fe9bd437e8429ba78e9d057c0621.webp",
    "sourceTemplateId": "4f7f527889144accb85279797d3f68e7",
    "aliases": {}
  },
  "pl-7558062a1bfecd53e62f84e3be4ae8fb": {
    "cover": "/skill-covers/pl-7558062a1bfecd53e62f84e3be4ae8fb.webp",
    "sourceTemplateId": "4f91f8c8eea440229cf10319ea430f31",
    "aliases": {}
  },
  "pl-2555e0d9869a30717620eecc75d4d062": {
    "cover": "/skill-covers/pl-2555e0d9869a30717620eecc75d4d062.webp",
    "sourceTemplateId": "50c6b9f09e4444f498f1cc4735f9032c",
    "aliases": {}
  },
  "pl-3e12780ff02a979bbfb90c940d2ce74b": {
    "cover": "/skill-covers/pl-3e12780ff02a979bbfb90c940d2ce74b.webp",
    "sourceTemplateId": "51614a9dd1f8448197905547909531c8",
    "aliases": {}
  },
  "pl-99394e66b5ffa9b677887a7fde02d119": {
    "cover": "/skill-covers/pl-99394e66b5ffa9b677887a7fde02d119.webp",
    "sourceTemplateId": "5186be25d8944d4e99d4ea3e9dd368d5",
    "aliases": {}
  },
  "pl-b4b108420c604188e33ea2da99d364f7": {
    "cover": "/production-library/editorial-covers/pl-b4b108420c604188e33ea2da99d364f7.webp",
    "sourceTemplateId": "5294a0601c4e48bf96fa52d44122cbce",
    "aliases": {}
  },
  "pl-fcaa5052295aa2adf57b28f978b4e2d6": {
    "cover": "/skill-covers/pl-fcaa5052295aa2adf57b28f978b4e2d6.webp",
    "sourceTemplateId": "52a68da866fa4a4b8238db44bd91a882",
    "aliases": {}
  },
  "pl-8880ba7ad59e0ebf7e549455a1926d33": {
    "cover": "/skill-covers/pl-8880ba7ad59e0ebf7e549455a1926d33.webp",
    "sourceTemplateId": "53c0657771e749d2ba20b50a6f667509",
    "aliases": {}
  },
  "pl-447730bcca78e52b12437045a04d3be0": {
    "cover": "",
    "sourceTemplateId": "54d1db5ebc1a455d9b3aa02aa112332c",
    "aliases": {}
  },
  "pl-0889e31c1d2feac812bc4c4b86fe25a5": {
    "cover": "/skill-covers/pl-0889e31c1d2feac812bc4c4b86fe25a5.webp",
    "sourceTemplateId": "56e54c3545d4463b8cc5ccec46434abb",
    "aliases": {}
  },
  "pl-0db6cf41d8fc1bc7feb4961cb9419017": {
    "cover": "/skill-covers/pl-0db6cf41d8fc1bc7feb4961cb9419017.webp",
    "sourceTemplateId": "570e015a420a41ac815db77cee50d69d",
    "aliases": {}
  },
  "pl-4d1e4c16923b707d1ca4389738e38eba": {
    "cover": "/skill-covers/pl-4d1e4c16923b707d1ca4389738e38eba.webp",
    "sourceTemplateId": "5782b8e569b84ed3a3d917e940b56b30",
    "aliases": {}
  },
  "pl-a12451e884583f7a7175148277fb1ce1": {
    "cover": "/skill-covers/pl-a12451e884583f7a7175148277fb1ce1.webp",
    "sourceTemplateId": "57ebadea5c374de6be462bd9f2a87069",
    "aliases": {}
  },
  "pl-9905e58a5c329d915ee4fe4c0378beb5": {
    "cover": "/skill-covers/pl-9905e58a5c329d915ee4fe4c0378beb5.webp",
    "sourceTemplateId": "5804be7461a542eeac538d87bfe96252",
    "aliases": {}
  },
  "pl-94d4919d37dee12c5a40e7519e8c8a35": {
    "cover": "/skill-covers/pl-94d4919d37dee12c5a40e7519e8c8a35.webp",
    "sourceTemplateId": "589abfff31134c60bfa5cfcc6b27e034",
    "aliases": {}
  },
  "pl-7a7d3c0a903055f12cdc9021ff3eede4": {
    "cover": "/skill-covers/pl-7a7d3c0a903055f12cdc9021ff3eede4.webp",
    "sourceTemplateId": "5ac38c7909014c278f3e3018bb7b4a62",
    "aliases": {}
  },
  "pl-5bf8885f194ad1f656c53f164944f00f": {
    "cover": "/skill-covers/pl-5bf8885f194ad1f656c53f164944f00f.webp",
    "sourceTemplateId": "5aebadecfd4d4cfab1881d887c64198b",
    "aliases": {}
  },
  "pl-4caef9c52235cd44e70a8465758cb19b": {
    "cover": "/skill-covers/pl-4caef9c52235cd44e70a8465758cb19b.webp",
    "sourceTemplateId": "5b108585435f4de1a2073ef6d28d641b",
    "aliases": {}
  },
  "pl-b693b784bcaacd0c8f6ff2e736728295": {
    "cover": "/skill-covers/pl-b693b784bcaacd0c8f6ff2e736728295.webp",
    "sourceTemplateId": "5c371240763941d78f76a6e9da2f60cb",
    "aliases": {}
  },
  "pl-79131579a353485cacda710b17a03850": {
    "cover": "/skill-covers/pl-79131579a353485cacda710b17a03850.webp",
    "sourceTemplateId": "5c63e0759abc4fa88c6bdd295e589083",
    "aliases": {}
  },
  "pl-3be497169d7e0b6f96fbde78f7f870eb": {
    "cover": "/skill-covers/pl-3be497169d7e0b6f96fbde78f7f870eb.webp",
    "sourceTemplateId": "5c824efa2de745d58c47817bd952eadf",
    "aliases": {}
  },
  "pl-9dc29dabff5c8e7c46cbe99d0825e4f6": {
    "cover": "/skill-covers/pl-9dc29dabff5c8e7c46cbe99d0825e4f6.webp",
    "sourceTemplateId": "5cc49a638f3a4d0a9139cfe2132a31ae",
    "aliases": {}
  },
  "pl-07ce4e00153a5b980d3c38322bc31850": {
    "cover": "/skill-covers/pl-07ce4e00153a5b980d3c38322bc31850.webp",
    "sourceTemplateId": "5dca3eeed31d4836949c95cf8d45444b",
    "aliases": {
      "references/lighting-presets.md": "lighting-presets.md",
      "references/prompt-patterns.md": "prompt-patterns.md"
    }
  },
  "pl-406848fb7337be33ca9946e4f872e1ec": {
    "cover": "/skill-covers/pl-406848fb7337be33ca9946e4f872e1ec.webp",
    "sourceTemplateId": "5ff078acfee9463c8e62f459e27de6b7",
    "aliases": {}
  },
  "pl-d9ffd9b3afbe568a687fbc970743bf41": {
    "cover": "/skill-covers/pl-d9ffd9b3afbe568a687fbc970743bf41.webp",
    "sourceTemplateId": "6076ee65e02f48fb96fae11fc35f0b9c",
    "aliases": {}
  },
  "pl-9fa5b027b902f566df3d56cbd4ce0a1a": {
    "cover": "/skill-covers/pl-9fa5b027b902f566df3d56cbd4ce0a1a.webp",
    "sourceTemplateId": "60d381f42c724bd89eb88616657779ca",
    "aliases": {}
  },
  "pl-69dcac433c027daf7b4fc6e39c76e41f": {
    "cover": "/skill-covers/pl-69dcac433c027daf7b4fc6e39c76e41f.webp",
    "sourceTemplateId": "60e673aace2c4971a02859275b8fe85f",
    "aliases": {}
  },
  "pl-c762c44d0bc24850dcc9cdebf2dec677": {
    "cover": "/skill-covers/pl-c762c44d0bc24850dcc9cdebf2dec677.webp",
    "sourceTemplateId": "60fd1e76ab294b10ab66984691bc03c6",
    "aliases": {}
  },
  "pl-c0229ebad515cf1f4d36a88e15709a7d": {
    "cover": "/skill-covers/pl-c0229ebad515cf1f4d36a88e15709a7d.webp",
    "sourceTemplateId": "62d468a925eb4132a1bfeea6c5c65517",
    "aliases": {}
  },
  "pl-f2e8e4939d01c4053e9cd3ef636c096b": {
    "cover": "/skill-covers/pl-f2e8e4939d01c4053e9cd3ef636c096b.webp",
    "sourceTemplateId": "6416b96a53754fe99216a759ed445f84",
    "aliases": {}
  },
  "pl-13a894bed5210b6551941e484ab76517": {
    "cover": "/skill-covers/pl-13a894bed5210b6551941e484ab76517.webp",
    "sourceTemplateId": "64a663d94286442e8386c48a5a474344",
    "aliases": {}
  },
  "pl-4ec0710680295b35faf0132b82c7373e": {
    "cover": "/skill-covers/pl-4ec0710680295b35faf0132b82c7373e.webp",
    "sourceTemplateId": "65b804bb8e5e4c65918ab5fb9d4e877f",
    "aliases": {}
  },
  "pl-ad2b5a708f56bde988a877dacf854192": {
    "cover": "/skill-covers/pl-ad2b5a708f56bde988a877dacf854192.webp",
    "sourceTemplateId": "65f92cad13dc43c781d2d1855785e211",
    "aliases": {}
  },
  "pl-5d1ad04e990c8fdbbea28993eddec3fd": {
    "cover": "/skill-covers/pl-5d1ad04e990c8fdbbea28993eddec3fd.webp",
    "sourceTemplateId": "664db9e843a44fda83dab50a8a882477",
    "aliases": {}
  },
  "pl-9a0bcec1cbfda268a844621139cc1f9e": {
    "cover": "/skill-covers/pl-9a0bcec1cbfda268a844621139cc1f9e.webp",
    "sourceTemplateId": "6668e5745f2d4963afaa7e459efde086",
    "aliases": {}
  },
  "pl-30ad1b79d25c491523571423bc9ca3c9": {
    "cover": "/skill-covers/pl-30ad1b79d25c491523571423bc9ca3c9.webp",
    "sourceTemplateId": "66af9b07f09f483c85cdb7d64806a992",
    "aliases": {}
  },
  "pl-df5a9349878c023032f80c21c0a761ef": {
    "cover": "",
    "sourceTemplateId": "66f9a6b4f90a4715b38bff9896394cbe",
    "aliases": {}
  },
  "pl-daabf779e2121a32e53b8cd470f9430b": {
    "cover": "/skill-covers/pl-daabf779e2121a32e53b8cd470f9430b.webp",
    "sourceTemplateId": "67ace747e33e47f6b54b899f8b364c98",
    "aliases": {}
  },
  "pl-c23e293ff431b932fae3dbb97619f587": {
    "cover": "/production-library/editorial-covers/pl-c23e293ff431b932fae3dbb97619f587.webp",
    "sourceTemplateId": "688432191dc74d47b17d2d7f8d1013d9",
    "aliases": {}
  },
  "pl-75de44f7dc2aa3f794f458a6055d697f": {
    "cover": "/skill-covers/pl-75de44f7dc2aa3f794f458a6055d697f.webp",
    "sourceTemplateId": "6907bccd58bc48c2b4af6da66d779688",
    "aliases": {}
  },
  "pl-6994b35b7da3fea2440e028457103a6b": {
    "cover": "/skill-covers/pl-6994b35b7da3fea2440e028457103a6b.webp",
    "sourceTemplateId": "69ece673182e4b6eb87e68c144329597",
    "aliases": {}
  },
  "pl-3faa82e3eeaf694ae51095c838d27af2": {
    "cover": "/skill-covers/pl-3faa82e3eeaf694ae51095c838d27af2.webp",
    "sourceTemplateId": "6a68f81a7a7d4e0d8ef87869407cf97e",
    "aliases": {}
  },
  "pl-cb6ee166cfaeeee0d57f06b78c398938": {
    "cover": "/skill-covers/pl-cb6ee166cfaeeee0d57f06b78c398938.webp",
    "sourceTemplateId": "6a7bfbdfc9a54f2ebb447497e75769c9",
    "aliases": {}
  },
  "pl-27d8b4fb777f0b634edb6f442cb6a474": {
    "cover": "/skill-covers/pl-27d8b4fb777f0b634edb6f442cb6a474.webp",
    "sourceTemplateId": "6aa8d11ce3d544f38bde1e65d7ef601e",
    "aliases": {}
  },
  "pl-a778e86df58359d7c6d45c10e72abf42": {
    "cover": "/skill-covers/pl-a778e86df58359d7c6d45c10e72abf42.webp",
    "sourceTemplateId": "6bb68f702805425dae89543b8a6975ff",
    "aliases": {}
  },
  "pl-632649c5b4ff3946798af2545d308654": {
    "cover": "/skill-covers/pl-632649c5b4ff3946798af2545d308654.webp",
    "sourceTemplateId": "6c2c19c151be4e49b42364af033f0488",
    "aliases": {}
  },
  "pl-9d3e45bd267d6ea0ae32efa97ff8dd44": {
    "cover": "/skill-covers/pl-9d3e45bd267d6ea0ae32efa97ff8dd44.webp",
    "sourceTemplateId": "6c7b4a6745dc4b62969d338c28da25a6",
    "aliases": {}
  },
  "pl-2cc13dba4b2aeefbba88f34866e7921b": {
    "cover": "/skill-covers/pl-2cc13dba4b2aeefbba88f34866e7921b.webp",
    "sourceTemplateId": "6d4405eb4ff94c19a68d98a821895ee2",
    "aliases": {}
  },
  "pl-3df8c83f86be5abdb9bb964451fe44c5": {
    "cover": "",
    "sourceTemplateId": "6d90fc0f4daf414198109a524b8147bb",
    "aliases": {}
  },
  "pl-2c77ed62e86c6d5c2af7772fdd830a97": {
    "cover": "/production-library/editorial-covers/pl-2c77ed62e86c6d5c2af7772fdd830a97.webp",
    "sourceTemplateId": "6e02008fd38648189b70b7901f681d72",
    "aliases": {}
  },
  "pl-5ec11c4b3a82c7b007acbc927d23b3ec": {
    "cover": "/skill-covers/pl-5ec11c4b3a82c7b007acbc927d23b3ec.webp",
    "sourceTemplateId": "6ecb5cbc9b854360b17582e56db7616c",
    "aliases": {}
  },
  "pl-30d960f13b3823f552d9c98c104f0d72": {
    "cover": "/skill-covers/pl-30d960f13b3823f552d9c98c104f0d72.webp",
    "sourceTemplateId": "6ed0146e34cc46fcb692e2114954ed02",
    "aliases": {}
  },
  "pl-ccd061aa246b38acea95eb00039d2308": {
    "cover": "/skill-covers/pl-ccd061aa246b38acea95eb00039d2308.webp",
    "sourceTemplateId": "6fb032f0f8274af7ba8bc708d925eb3f",
    "aliases": {}
  },
  "pl-782103ffd4629f69dc8fe796ac3548e1": {
    "cover": "/skill-covers/pl-782103ffd4629f69dc8fe796ac3548e1.webp",
    "sourceTemplateId": "6fe4ed80be834014b3a57390b2e0e63b",
    "aliases": {}
  },
  "pl-2e40afd44170fa330c5326f1289ff4e7": {
    "cover": "/skill-covers/pl-2e40afd44170fa330c5326f1289ff4e7.webp",
    "sourceTemplateId": "70229d2548bc409ab473811b731cfd53",
    "aliases": {}
  },
  "pl-50d11eaa401d454a8eb923f693887f42": {
    "cover": "/skill-covers/pl-50d11eaa401d454a8eb923f693887f42.webp",
    "sourceTemplateId": "7061edc00b2e40bfb686274802bbfb93",
    "aliases": {}
  },
  "pl-cc30e4aa0b2fc07422b340a7731205f2": {
    "cover": "/production-library/editorial-covers/pl-cc30e4aa0b2fc07422b340a7731205f2.webp",
    "sourceTemplateId": "7090ed889f3e4ac8bfd3befd4d6b1be7",
    "aliases": {}
  },
  "pl-21e20c1130c7ceb1bc17b5cafe4fc15c": {
    "cover": "/skill-covers/pl-21e20c1130c7ceb1bc17b5cafe4fc15c.webp",
    "sourceTemplateId": "709353520cbb4c22a70d22142b9959d1",
    "aliases": {}
  },
  "pl-5d3ea274555feaf524977604c39de622": {
    "cover": "/skill-covers/pl-5d3ea274555feaf524977604c39de622.webp",
    "sourceTemplateId": "709c09b991a84bb18de41d287754ba4a",
    "aliases": {}
  },
  "pl-03d1d319008dcaa86ddb41ea6d4afdd7": {
    "cover": "/skill-covers/pl-03d1d319008dcaa86ddb41ea6d4afdd7.webp",
    "sourceTemplateId": "70adb0f4e32a4c0a8efdcb78e4a87ceb",
    "aliases": {}
  },
  "pl-281eefd113e2e05482a34cc5b06e2047": {
    "cover": "/skill-covers/pl-281eefd113e2e05482a34cc5b06e2047.webp",
    "sourceTemplateId": "70b85487b61f4bdab359303294235ebb",
    "aliases": {}
  },
  "pl-8d31aa40a336fd7163a014188332a06d": {
    "cover": "/skill-covers/pl-8d31aa40a336fd7163a014188332a06d.webp",
    "sourceTemplateId": "70c29306d2a24f95a3c539a9ddbe3e34",
    "aliases": {}
  },
  "pl-454c0d70eb13908126b6d9204479613c": {
    "cover": "/skill-covers/pl-454c0d70eb13908126b6d9204479613c.webp",
    "sourceTemplateId": "714b34a0a8494372b56955eb456b21ea",
    "aliases": {}
  },
  "pl-5ccea8f5c37bd6e0bac7da8773aaca3e": {
    "cover": "/skill-covers/pl-5ccea8f5c37bd6e0bac7da8773aaca3e.webp",
    "sourceTemplateId": "7184f0a08142408fbad51cfa20f1abb8",
    "aliases": {}
  },
  "pl-9d12148d0f6a7f124e9642f8cf5b96e4": {
    "cover": "/skill-covers/pl-9d12148d0f6a7f124e9642f8cf5b96e4.webp",
    "sourceTemplateId": "719dfabf54914213a13483ba055cd284",
    "aliases": {}
  },
  "pl-53c38a398c7cbf8be14d2db15b3d9975": {
    "cover": "/skill-covers/pl-53c38a398c7cbf8be14d2db15b3d9975.webp",
    "sourceTemplateId": "7327ce6c6f4c430ea9bc014d42b554e2",
    "aliases": {}
  },
  "pl-fbb61d085dd6dfbe5957d25f1191c0ca": {
    "cover": "/skill-covers/pl-fbb61d085dd6dfbe5957d25f1191c0ca.webp",
    "sourceTemplateId": "745df4f500e04d2ea1e977268d6675a3",
    "aliases": {}
  },
  "pl-fc56cc6e21faf787fedaeb4289ce214f": {
    "cover": "/skill-covers/pl-fc56cc6e21faf787fedaeb4289ce214f.webp",
    "sourceTemplateId": "74e1e091aa094ebf9a8ba147f507ee55",
    "aliases": {}
  },
  "pl-058c50365b41713b519bb79adf7589d5": {
    "cover": "/skill-covers/pl-058c50365b41713b519bb79adf7589d5.webp",
    "sourceTemplateId": "751c809adf794a1c8746c15434150b0a",
    "aliases": {}
  },
  "pl-8ba66f25ace8dd219ab2adeacc134e2c": {
    "cover": "/skill-covers/pl-8ba66f25ace8dd219ab2adeacc134e2c.webp",
    "sourceTemplateId": "753039b7de724c368f2343d2cc7e196a",
    "aliases": {}
  },
  "pl-028ffcf363fb93f11b7528b247cfa3f1": {
    "cover": "",
    "sourceTemplateId": "75c9f4001ccd4849afff59e07d3577cc",
    "aliases": {}
  },
  "pl-2683b260378a9fb7bca46641e36c92dd": {
    "cover": "/skill-covers/pl-2683b260378a9fb7bca46641e36c92dd.webp",
    "sourceTemplateId": "75ffac2aa244474a95c50a3e94b30a0a",
    "aliases": {}
  },
  "pl-3104e556f4831e0d306b44fae2b95ce1": {
    "cover": "/skill-covers/pl-3104e556f4831e0d306b44fae2b95ce1.webp",
    "sourceTemplateId": "764994ce90bb4548907db4ffd7752899",
    "aliases": {}
  },
  "pl-2eeafb7ba12fca567c94139d57f96071": {
    "cover": "",
    "sourceTemplateId": "77d32ea23823441eb8685cfe26e5d340",
    "aliases": {}
  },
  "pl-410e9208d91af9e6b29c12d82d59413e": {
    "cover": "/skill-covers/pl-410e9208d91af9e6b29c12d82d59413e.webp",
    "sourceTemplateId": "79fd39a87e154af78de96c0f42542a92",
    "aliases": {}
  },
  "pl-7df58f37fafe9484821bb33bb0d7ba26": {
    "cover": "/skill-covers/pl-7df58f37fafe9484821bb33bb0d7ba26.webp",
    "sourceTemplateId": "7a79f1ab00f04fe2a7dfc0e3684d246c",
    "aliases": {}
  },
  "pl-8f4320f4a3ef270d71e5068f3fe4b6a7": {
    "cover": "/skill-covers/pl-8f4320f4a3ef270d71e5068f3fe4b6a7.webp",
    "sourceTemplateId": "7a8fd6b6830c4f2886651ca1935d4b8c",
    "aliases": {}
  },
  "pl-5e5afac9c25ae3a5d3b6f90150236e3c": {
    "cover": "/skill-covers/pl-5e5afac9c25ae3a5d3b6f90150236e3c.webp",
    "sourceTemplateId": "7b2d47f2931240dfade3322788447a53",
    "aliases": {}
  },
  "pl-8ce0114c0210dadd9285bf9e483c7bca": {
    "cover": "/skill-covers/pl-8ce0114c0210dadd9285bf9e483c7bca.webp",
    "sourceTemplateId": "7b4b7d1d1d6946b3a5a9b7b6083f8e93",
    "aliases": {}
  },
  "pl-a83327a342af30716a04fbd9e87b010e": {
    "cover": "/skill-covers/pl-a83327a342af30716a04fbd9e87b010e.webp",
    "sourceTemplateId": "7b94472df0f6461e935f6623216a622b",
    "aliases": {}
  },
  "pl-9d48a6f9e82ff5afeb09381da5baee57": {
    "cover": "/production-library/editorial-covers/pl-9d48a6f9e82ff5afeb09381da5baee57.webp",
    "sourceTemplateId": "7b9baef04aa249fc85b594c7092865cc",
    "aliases": {}
  },
  "pl-85f623edcd3ff2002b705f8606730cfc": {
    "cover": "/skill-covers/pl-85f623edcd3ff2002b705f8606730cfc.webp",
    "sourceTemplateId": "7ba34931c0bc4c26a57d81b1a0f14527",
    "aliases": {}
  },
  "pl-fb4810e5f81355b33fa6c8751fc41d60": {
    "cover": "/skill-covers/pl-fb4810e5f81355b33fa6c8751fc41d60.webp",
    "sourceTemplateId": "7c21d464b7d7424b997ee5186eeff907",
    "aliases": {}
  },
  "pl-9ebb1d4c9d0e2c4195edee278d451209": {
    "cover": "/skill-covers/pl-9ebb1d4c9d0e2c4195edee278d451209.webp",
    "sourceTemplateId": "7dccee374a8b4d54986347ed74900611",
    "aliases": {}
  },
  "pl-df402c39dc789f7814715656b2f10027": {
    "cover": "/production-library/editorial-covers/pl-df402c39dc789f7814715656b2f10027.webp",
    "sourceTemplateId": "7e15150b88844110ba081422da6b33e2",
    "aliases": {}
  },
  "pl-0167d5898e6c13f60669d036485f90cb": {
    "cover": "/skill-covers/pl-0167d5898e6c13f60669d036485f90cb.webp",
    "sourceTemplateId": "7e5108e4f5e9470b95f70b20f1793c75",
    "aliases": {}
  },
  "pl-978f454503e1f8b97e69f1e7432beadf": {
    "cover": "/skill-covers/pl-978f454503e1f8b97e69f1e7432beadf.webp",
    "sourceTemplateId": "7e8963b37b9b499284161875fca6fc80",
    "aliases": {}
  },
  "pl-4a6fe5b70740a9bc858bb545ab0b676d": {
    "cover": "/production-library/editorial-covers/pl-4a6fe5b70740a9bc858bb545ab0b676d.webp",
    "sourceTemplateId": "7ed0ec434f2e49c797a482479ac0c9ab",
    "aliases": {}
  },
  "pl-861f2558ea408b0397d522caecaffe3b": {
    "cover": "/skill-covers/pl-861f2558ea408b0397d522caecaffe3b.webp",
    "sourceTemplateId": "7ef38c70e34443d3b9083c854b1836a3",
    "aliases": {}
  },
  "pl-2dcad35b495a1c95e87622ab8765b43c": {
    "cover": "/skill-covers/pl-2dcad35b495a1c95e87622ab8765b43c.webp",
    "sourceTemplateId": "7ef5758db4b84d1b8a335a57959ec1f0",
    "aliases": {}
  },
  "pl-a1a9b238b9b3346f84b48c117d442cf4": {
    "cover": "/skill-covers/pl-a1a9b238b9b3346f84b48c117d442cf4.webp",
    "sourceTemplateId": "7efd8f0969b04bf391dc3589f8aebdc9",
    "aliases": {}
  },
  "pl-24241c8918b46c055199d624c483e5ad": {
    "cover": "/skill-covers/pl-24241c8918b46c055199d624c483e5ad.webp",
    "sourceTemplateId": "805dca7835fb42de93baec1779a56c66",
    "aliases": {}
  },
  "pl-3b93349ee48eaea222d35ad9800df3d8": {
    "cover": "/production-library/editorial-covers/pl-3b93349ee48eaea222d35ad9800df3d8.webp",
    "sourceTemplateId": "80bb5d78741f429da4ef48e6161b2b99",
    "aliases": {}
  },
  "pl-43cba66846209d4d06b4d49f8b68828a": {
    "cover": "/skill-covers/pl-43cba66846209d4d06b4d49f8b68828a.webp",
    "sourceTemplateId": "810c3059256947739469479662712dc2",
    "aliases": {}
  },
  "pl-19393815066760c7dd2e818390e4f1cf": {
    "cover": "/production-library/editorial-covers/pl-19393815066760c7dd2e818390e4f1cf.webp",
    "sourceTemplateId": "8180f5ae3a4b46ed8a1f50a6063bb871",
    "aliases": {}
  },
  "pl-42d293a7cf0794c2e69141ecc8725509": {
    "cover": "/skill-covers/pl-42d293a7cf0794c2e69141ecc8725509.webp",
    "sourceTemplateId": "81f41c7cd59b45e3b6b8c896e8776a9d",
    "aliases": {}
  },
  "pl-cb6485f34b590bb4e03622616778285a": {
    "cover": "/skill-covers/pl-cb6485f34b590bb4e03622616778285a.webp",
    "sourceTemplateId": "8219e94f29414cc499422d87b1ca16e6",
    "aliases": {}
  },
  "pl-d0077dcce01ae8e87cbc4fb127e11b65": {
    "cover": "/skill-covers/pl-d0077dcce01ae8e87cbc4fb127e11b65.webp",
    "sourceTemplateId": "823ebbc207b94070ba089fe8e8151fdf",
    "aliases": {}
  },
  "pl-2713f65626e1f55be76b5075f406c858": {
    "cover": "/skill-covers/pl-2713f65626e1f55be76b5075f406c858.webp",
    "sourceTemplateId": "82e89fa3c0cc41cb813da9429fb394a8",
    "aliases": {}
  },
  "pl-5ece9b802b8aabbd4c7d4faca11de53b": {
    "cover": "/skill-covers/pl-5ece9b802b8aabbd4c7d4faca11de53b.webp",
    "sourceTemplateId": "8323178d410349309f75beb85f64f271",
    "aliases": {}
  },
  "pl-9cf2cfba7d756cfd62d3e8b7741ac28b": {
    "cover": "/skill-covers/pl-9cf2cfba7d756cfd62d3e8b7741ac28b.webp",
    "sourceTemplateId": "8395d9fc36414ccbaca161e7f0404b93",
    "aliases": {}
  },
  "pl-c6001ff7db3703c5c4811d529a970f7c": {
    "cover": "/production-library/editorial-covers/pl-c6001ff7db3703c5c4811d529a970f7c.webp",
    "sourceTemplateId": "85319501693645f6bb74eee0b62ccfa6",
    "aliases": {}
  },
  "pl-673be01cff84004808304a717b2b47c5": {
    "cover": "/skill-covers/pl-673be01cff84004808304a717b2b47c5.webp",
    "sourceTemplateId": "85e5429b84c7489ba74bd3b19c33e32b",
    "aliases": {}
  },
  "pl-c314de3e3d0e54e01426d87c01023a82": {
    "cover": "/production-library/editorial-covers/pl-c314de3e3d0e54e01426d87c01023a82.webp",
    "sourceTemplateId": "85feecd629b14a6ca470737669440819",
    "aliases": {}
  },
  "pl-2bc03330983f80e9cfee44d27ac66ee8": {
    "cover": "/skill-covers/pl-2bc03330983f80e9cfee44d27ac66ee8.webp",
    "sourceTemplateId": "86de1cb1e60b4591835b7eb04ef2510c",
    "aliases": {}
  },
  "pl-50c55bb911e06d362982a196cfd1573d": {
    "cover": "/skill-covers/pl-50c55bb911e06d362982a196cfd1573d.webp",
    "sourceTemplateId": "875baddddfcc4f819ee1a56c6d65a908",
    "aliases": {}
  },
  "pl-30523fac0a7d0df2e25cb2dd3c395fc0": {
    "cover": "/skill-covers/pl-30523fac0a7d0df2e25cb2dd3c395fc0.webp",
    "sourceTemplateId": "8765e80f90fe46018e9548c39509aa8d",
    "aliases": {}
  },
  "pl-1559a833013093e5d2fac507620a3c1f": {
    "cover": "/skill-covers/pl-1559a833013093e5d2fac507620a3c1f.webp",
    "sourceTemplateId": "879ee7f046964834a7c0dc753413572f",
    "aliases": {}
  },
  "pl-45d4c70404de3f64ccb5ec75278f9396": {
    "cover": "/skill-covers/pl-45d4c70404de3f64ccb5ec75278f9396.webp",
    "sourceTemplateId": "87be5b0c3b9649e3be06f0c4337d9aff",
    "aliases": {}
  },
  "pl-f4cb6253121d3608f190c560764adeb7": {
    "cover": "/skill-covers/pl-f4cb6253121d3608f190c560764adeb7.webp",
    "sourceTemplateId": "8860c49faaf840ae84effd0a9e0a2e3d",
    "aliases": {}
  },
  "pl-bb463b289d568057a3204d428501421a": {
    "cover": "/skill-covers/pl-bb463b289d568057a3204d428501421a.webp",
    "sourceTemplateId": "88a218e7fde0407e9f8214dd3327ec5e",
    "aliases": {}
  },
  "pl-c63182de0eae363904222b296175019c": {
    "cover": "/skill-covers/pl-c63182de0eae363904222b296175019c.webp",
    "sourceTemplateId": "88f1180834cf4bb3bb597a5cd3f92812",
    "aliases": {}
  },
  "pl-2f67e6cc71812a3eda0523440f2abf64": {
    "cover": "/skill-covers/pl-2f67e6cc71812a3eda0523440f2abf64.webp",
    "sourceTemplateId": "8900eaea6d6646ae898c3d25fbac83df",
    "aliases": {}
  },
  "pl-16138e21bc1bd494526dd3b179691f95": {
    "cover": "/skill-covers/pl-16138e21bc1bd494526dd3b179691f95.webp",
    "sourceTemplateId": "8afb2f16ec4c4d078adbfd2f87784f1b",
    "aliases": {}
  },
  "pl-b58b895b097eb959e87ea1652161d4c6": {
    "cover": "/skill-covers/pl-b58b895b097eb959e87ea1652161d4c6.webp",
    "sourceTemplateId": "8b6a98be374d4b91849d0df8759b318e",
    "aliases": {}
  },
  "pl-ee9bf565f12dda1a2f14e53fc649e30f": {
    "cover": "/skill-covers/pl-ee9bf565f12dda1a2f14e53fc649e30f.webp",
    "sourceTemplateId": "8bad2cc8fd30430c9d6747e9218258f1",
    "aliases": {}
  },
  "pl-3263315608366b1b084401c31a9a3e2a": {
    "cover": "/skill-covers/pl-3263315608366b1b084401c31a9a3e2a.webp",
    "sourceTemplateId": "8bdfb3a8f12341c29f6d5091d8af83b9",
    "aliases": {}
  },
  "pl-736c1d05233ad2771c65f0b6f184a882": {
    "cover": "/skill-covers/pl-736c1d05233ad2771c65f0b6f184a882.webp",
    "sourceTemplateId": "8c8816b11ca9465d8b8ec6f3cf6b9317",
    "aliases": {}
  },
  "pl-2cabf1dc59ab84a61f4b75a185a80cf7": {
    "cover": "/skill-covers/pl-2cabf1dc59ab84a61f4b75a185a80cf7.webp",
    "sourceTemplateId": "8c8db429341947cd976cd7459a318a11",
    "aliases": {}
  },
  "pl-6c97dcd55667a67be1825e0812b7adb8": {
    "cover": "/skill-covers/pl-6c97dcd55667a67be1825e0812b7adb8.webp",
    "sourceTemplateId": "8c9e47e6e5a44454a9e12f6f07303207",
    "aliases": {}
  },
  "pl-2611eaea76b8b6d5e364d029d4ad7747": {
    "cover": "/production-library/editorial-covers/pl-2611eaea76b8b6d5e364d029d4ad7747.webp",
    "sourceTemplateId": "8cd6e415285b4e3baa262332beb96b9d",
    "aliases": {}
  },
  "pl-6c0573a14f5d2093cefa7bccdea63891": {
    "cover": "/skill-covers/pl-6c0573a14f5d2093cefa7bccdea63891.webp",
    "sourceTemplateId": "8dd5231a26be47d69e4bf614f7691e17",
    "aliases": {}
  },
  "pl-a6ecbf9d0016669b78e8d5fb7f98c131": {
    "cover": "/skill-covers/pl-a6ecbf9d0016669b78e8d5fb7f98c131.webp",
    "sourceTemplateId": "8e88b7397abd4ec8b0cbaec5ed06d849",
    "aliases": {}
  },
  "pl-ee5525d44455a8bd6057f29da33540fc": {
    "cover": "/skill-covers/pl-ee5525d44455a8bd6057f29da33540fc.webp",
    "sourceTemplateId": "8f30576f080b4a93adf608196541f991",
    "aliases": {}
  },
  "pl-ac731059a45f47c15be773ba62a71a1f": {
    "cover": "/skill-covers/pl-ac731059a45f47c15be773ba62a71a1f.webp",
    "sourceTemplateId": "8f674e7ea43146968b7768978eee4c62",
    "aliases": {}
  },
  "pl-34a50d1415602333207ea71bb8022501": {
    "cover": "/skill-covers/pl-34a50d1415602333207ea71bb8022501.webp",
    "sourceTemplateId": "8f7b8a12eb0b44d8b41b08ca65fa868d",
    "aliases": {}
  },
  "pl-cd88aa4f4a2bf91b88056068e6920b4a": {
    "cover": "/skill-covers/pl-cd88aa4f4a2bf91b88056068e6920b4a.webp",
    "sourceTemplateId": "90524362b61847c6b4d808f440bfde08",
    "aliases": {}
  },
  "pl-aebdb9564303e938095fc64caa497011": {
    "cover": "/skill-covers/pl-aebdb9564303e938095fc64caa497011.webp",
    "sourceTemplateId": "90a8d23a758842e3865083f550c33f71",
    "aliases": {}
  },
  "pl-75f3dbe6b652419e91761bafb4055a40": {
    "cover": "/skill-covers/pl-75f3dbe6b652419e91761bafb4055a40.webp",
    "sourceTemplateId": "92698d5020024373b87b325aafd54f3b",
    "aliases": {}
  },
  "pl-db8de7a0099e8b5d4c4d648caefd753e": {
    "cover": "/skill-covers/pl-db8de7a0099e8b5d4c4d648caefd753e.webp",
    "sourceTemplateId": "927948f529604e70875549b1ce88545c",
    "aliases": {
      "references/libtv-form.md": "refresh-drink-ad-20s/references/libtv-form.md",
      "references/libtv-runtime.md": "refresh-drink-ad-20s/references/libtv-runtime.md",
      "references/prompts.md": "refresh-drink-ad-20s/references/prompts.md",
      "references/quality-gates.md": "refresh-drink-ad-20s/references/quality-gates.md",
      "references/style-reference.md": "refresh-drink-ad-20s/references/style-reference.md",
      "references/workflow.md": "refresh-drink-ad-20s/references/workflow.md"
    }
  },
  "pl-feb9d4c3c9962636bcefa6e3948480de": {
    "cover": "/skill-covers/pl-feb9d4c3c9962636bcefa6e3948480de.webp",
    "sourceTemplateId": "927c64f46b844b1d83b6384b42c399b3",
    "aliases": {}
  },
  "pl-f424c70d3707319af4998b3147eec5c2": {
    "cover": "/skill-covers/pl-f424c70d3707319af4998b3147eec5c2.webp",
    "sourceTemplateId": "92c9c849847c4a5dae7596bfd2def6e7",
    "aliases": {}
  },
  "pl-27653889e3f20b067f4dc71b8629be1e": {
    "cover": "/skill-covers/pl-27653889e3f20b067f4dc71b8629be1e.webp",
    "sourceTemplateId": "93abe84ef21949d5937f96560d910736",
    "aliases": {}
  },
  "pl-c03762340bedec8c51aab605ecfc8105": {
    "cover": "/skill-covers/pl-c03762340bedec8c51aab605ecfc8105.webp",
    "sourceTemplateId": "93c24c8bdb8b4cfd9a0629426b886a31",
    "aliases": {}
  },
  "pl-98b43353ed3a4f165770adb9284c7946": {
    "cover": "/skill-covers/pl-98b43353ed3a4f165770adb9284c7946.webp",
    "sourceTemplateId": "93d98c86ce3841a19e410e5ab51a7079",
    "aliases": {}
  },
  "pl-46de7c40d6bc19d0793bb2e4c4c6b323": {
    "cover": "/skill-covers/pl-46de7c40d6bc19d0793bb2e4c4c6b323.webp",
    "sourceTemplateId": "942b6f60f3114a639c508748cbefd37c",
    "aliases": {}
  },
  "pl-a142f91f3f44fbd17f9eef030225570a": {
    "cover": "/skill-covers/pl-a142f91f3f44fbd17f9eef030225570a.webp",
    "sourceTemplateId": "9550d7084a014b3b908b83bc4be2f70e",
    "aliases": {}
  },
  "pl-2727f4797844fe047784735f245ba8c2": {
    "cover": "/skill-covers/pl-2727f4797844fe047784735f245ba8c2.webp",
    "sourceTemplateId": "95724abdf077439384d7ef3392d99a84",
    "aliases": {}
  },
  "pl-1cb4831b94657b90467cf493239fcc8b": {
    "cover": "/skill-covers/pl-1cb4831b94657b90467cf493239fcc8b.webp",
    "sourceTemplateId": "96885fef075a497ca7b58505be0800b2",
    "aliases": {}
  },
  "pl-90c698fe1d1ef687504679a42ddb4e7b": {
    "cover": "/skill-covers/pl-90c698fe1d1ef687504679a42ddb4e7b.webp",
    "sourceTemplateId": "96997bb7da1f4078989041e94009a3cb",
    "aliases": {}
  },
  "pl-9d9e20a6ea5ed9e8f564bd196dc9a898": {
    "cover": "/skill-covers/pl-9d9e20a6ea5ed9e8f564bd196dc9a898.webp",
    "sourceTemplateId": "97127efaeb464d90a1bad393638dea12",
    "aliases": {}
  },
  "pl-33a8d717ceebc7ac595bbc7e624f16d8": {
    "cover": "/skill-covers/pl-33a8d717ceebc7ac595bbc7e624f16d8.webp",
    "sourceTemplateId": "978b47c9dfcd484d9fbc3848961a46dd",
    "aliases": {}
  },
  "pl-8c59224b57ab5106231bbe23d073edba": {
    "cover": "/skill-covers/pl-8c59224b57ab5106231bbe23d073edba.webp",
    "sourceTemplateId": "98253e1a4bdc4f6bada550d80170afc4",
    "aliases": {}
  },
  "pl-c5c1c9c52e7fd63d72d3b03ac47eab3f": {
    "cover": "/skill-covers/pl-c5c1c9c52e7fd63d72d3b03ac47eab3f.webp",
    "sourceTemplateId": "9968246c10d243eaa4c016e4dc2f01db",
    "aliases": {}
  },
  "pl-9fd66e531df0cca7828d6cb599788b81": {
    "cover": "/skill-covers/pl-9fd66e531df0cca7828d6cb599788b81.webp",
    "sourceTemplateId": "99a6b6f446e94d92bb0e690e179377be",
    "aliases": {}
  },
  "pl-99941c9075cc33a70238eadb245a6c5c": {
    "cover": "/skill-covers/pl-99941c9075cc33a70238eadb245a6c5c.webp",
    "sourceTemplateId": "99c604e7a68449f59ee25a4b878ae27a",
    "aliases": {}
  },
  "pl-56cdb984a799d660db1f47f18cff353f": {
    "cover": "",
    "sourceTemplateId": "9a7337c6a43e4ec892c8738998746ba1",
    "aliases": {}
  },
  "pl-6f3dadc17583cc60ca4a827a870c1664": {
    "cover": "/skill-covers/pl-6f3dadc17583cc60ca4a827a870c1664.webp",
    "sourceTemplateId": "9ae90359ef3c4a81b37b1b6d68c0b24d",
    "aliases": {}
  },
  "pl-0cf562f2f628ffe9fdcaa8fb9cd5d978": {
    "cover": "/production-library/editorial-covers/pl-0cf562f2f628ffe9fdcaa8fb9cd5d978.webp",
    "sourceTemplateId": "9b7938a9e135452197f8040fb45dc162",
    "aliases": {}
  },
  "pl-a40dfcdcb9198379fe63f3aa79e15b7f": {
    "cover": "/skill-covers/pl-a40dfcdcb9198379fe63f3aa79e15b7f.webp",
    "sourceTemplateId": "9b7af9780e3b49dcbd92a1cd26c43805",
    "aliases": {}
  },
  "pl-0723c81e7a432bcaab9c92f36eefa7f2": {
    "cover": "/skill-covers/pl-0723c81e7a432bcaab9c92f36eefa7f2.webp",
    "sourceTemplateId": "9bdc6dbf3ff84f60a532fd0e0423f3b3",
    "aliases": {}
  },
  "pl-e64fc85d157adaa1b356efa199557b6a": {
    "cover": "/skill-covers/pl-e64fc85d157adaa1b356efa199557b6a.webp",
    "sourceTemplateId": "9be124647db54d349c778b82687b8911",
    "aliases": {}
  },
  "pl-81e73373723732c9867b5cd459b54bf0": {
    "cover": "/skill-covers/pl-81e73373723732c9867b5cd459b54bf0.webp",
    "sourceTemplateId": "9c3c47989a44421f89ea38cddfa79537",
    "aliases": {}
  },
  "pl-bccebc6f262883210a9f1666317d8bda": {
    "cover": "/skill-covers/pl-bccebc6f262883210a9f1666317d8bda.webp",
    "sourceTemplateId": "9e3335fc2fc14d608b9d5ec9fa74961c",
    "aliases": {}
  },
  "pl-be25239cddaf9d6b6436556d4351a4ab": {
    "cover": "/skill-covers/pl-be25239cddaf9d6b6436556d4351a4ab.webp",
    "sourceTemplateId": "9e64a829bfe54ef4a6a372aeb2195d2f",
    "aliases": {}
  },
  "pl-ea467af569e363830efe6c90efadc87d": {
    "cover": "/skill-covers/pl-ea467af569e363830efe6c90efadc87d.webp",
    "sourceTemplateId": "9ebb9da644d8457b85e0c88f0c89ad31",
    "aliases": {}
  },
  "pl-4d4d553a9a20a1f75343138982c9807b": {
    "cover": "/skill-covers/pl-4d4d553a9a20a1f75343138982c9807b.webp",
    "sourceTemplateId": "9ef74cbb6dfb4355b736636997b363be",
    "aliases": {}
  },
  "pl-e4ac313765a36eece4791e3896648b20": {
    "cover": "/skill-covers/pl-e4ac313765a36eece4791e3896648b20.webp",
    "sourceTemplateId": "9f20298267e24bd2ad7e17f102c01bd0",
    "aliases": {}
  },
  "pl-d651279589f45e526601cee8cd21b430": {
    "cover": "/production-library/editorial-covers/pl-d651279589f45e526601cee8cd21b430.webp",
    "sourceTemplateId": "9f3ae5dd66da495aae0aa32b97017357",
    "aliases": {}
  },
  "pl-7b79e93f33fd51a03c2356f359faf4d4": {
    "cover": "/skill-covers/pl-7b79e93f33fd51a03c2356f359faf4d4.webp",
    "sourceTemplateId": "9fe4ddc1bbb14e238c339656ccdbacdb",
    "aliases": {}
  },
  "pl-784660372d42e4aa7d00a47c4b9b4f18": {
    "cover": "/skill-covers/pl-784660372d42e4aa7d00a47c4b9b4f18.webp",
    "sourceTemplateId": "a0f58f99d23648698d387ad9329d85f8",
    "aliases": {}
  },
  "pl-94b1b7ce8ee509842aef79a01fc0b385": {
    "cover": "/skill-covers/pl-94b1b7ce8ee509842aef79a01fc0b385.webp",
    "sourceTemplateId": "a120e3417d13481ba92ce9222f29d043",
    "aliases": {}
  },
  "pl-e4a0a8d714ed0a0eadcc18fbca2d5c83": {
    "cover": "/skill-covers/pl-e4a0a8d714ed0a0eadcc18fbca2d5c83.webp",
    "sourceTemplateId": "a18ca9ba601741df8c33b592256389a6",
    "aliases": {}
  },
  "pl-2bcc635e88169cea73ee0b4da0005765": {
    "cover": "/skill-covers/pl-2bcc635e88169cea73ee0b4da0005765.webp",
    "sourceTemplateId": "a1f7ae43203b4b518c81854c7fb8fbec",
    "aliases": {}
  },
  "pl-c957fcc90bec701d8b95c4ec7b39751f": {
    "cover": "/skill-covers/pl-c957fcc90bec701d8b95c4ec7b39751f.webp",
    "sourceTemplateId": "a2e703a0bde646f2aa1a3ff325d662a7",
    "aliases": {}
  },
  "pl-cbca8ad6db7e8dfbc032911e1ef985c6": {
    "cover": "/skill-covers/pl-cbca8ad6db7e8dfbc032911e1ef985c6.webp",
    "sourceTemplateId": "a3757c2dbdc9441d9d2c878effbd38c4",
    "aliases": {}
  },
  "pl-d0f702650c08e4fa439d50181ea0ddf0": {
    "cover": "/skill-covers/pl-d0f702650c08e4fa439d50181ea0ddf0.webp",
    "sourceTemplateId": "a3b433192b4747c685278ecfac178b69",
    "aliases": {}
  },
  "pl-988e8049fc8152d303bb654247a97897": {
    "cover": "/skill-covers/pl-988e8049fc8152d303bb654247a97897.webp",
    "sourceTemplateId": "a4115be6f2ef4a1da2eee4f358f5cedb",
    "aliases": {}
  },
  "pl-73389e9745201aa237bee45a8dd608e0": {
    "cover": "/skill-covers/pl-73389e9745201aa237bee45a8dd608e0.webp",
    "sourceTemplateId": "a4255b5d9c7d409fb437f98be365b1cc",
    "aliases": {}
  },
  "pl-b202cb8594b0b2b4f691fb1615cebefa": {
    "cover": "/skill-covers/pl-b202cb8594b0b2b4f691fb1615cebefa.webp",
    "sourceTemplateId": "a4d829c11b7f4478ba33937bfc94f5fd",
    "aliases": {}
  },
  "pl-36f61bc38c08d01ba57849696ba15e83": {
    "cover": "/skill-covers/pl-36f61bc38c08d01ba57849696ba15e83.webp",
    "sourceTemplateId": "a4dc26c5a42641e7a1b62b8cef1d818e",
    "aliases": {}
  },
  "pl-90ba6f7a7583d8a52f1f3d12f4ffc439": {
    "cover": "/skill-covers/pl-90ba6f7a7583d8a52f1f3d12f4ffc439.webp",
    "sourceTemplateId": "a5719593944c422f9c69b6de3ecde1d3",
    "aliases": {}
  },
  "pl-4a309193358faa76f7c76cf11f1463af": {
    "cover": "/skill-covers/pl-4a309193358faa76f7c76cf11f1463af.webp",
    "sourceTemplateId": "a8313a5132264a57ae4f1a41ad3862ca",
    "aliases": {}
  },
  "pl-f62ca10f6125bde619125386554053b6": {
    "cover": "/skill-covers/pl-f62ca10f6125bde619125386554053b6.webp",
    "sourceTemplateId": "a96ab08f533346239d0d8d006635eac7",
    "aliases": {}
  },
  "pl-724dad05d59b350509369567abd7198d": {
    "cover": "/skill-covers/pl-724dad05d59b350509369567abd7198d.webp",
    "sourceTemplateId": "a9d9dc45051c48d8b75d5a9ab537c324",
    "aliases": {}
  },
  "pl-3b05f0f64f6d64c8ebf464ac87f5c0c2": {
    "cover": "/production-library/editorial-covers/pl-3b05f0f64f6d64c8ebf464ac87f5c0c2.webp",
    "sourceTemplateId": "ab98368e5ca8476cb9fc4df2fe1f73aa",
    "aliases": {}
  },
  "pl-0e5fc0e8d0507058dc74abfd651065c1": {
    "cover": "/skill-covers/pl-0e5fc0e8d0507058dc74abfd651065c1.webp",
    "sourceTemplateId": "ac0a18e48e1c44419226bbd3a96af97d",
    "aliases": {}
  },
  "pl-80a307d6bda4f50c1fb465100b30414a": {
    "cover": "/skill-covers/pl-80a307d6bda4f50c1fb465100b30414a.webp",
    "sourceTemplateId": "ac9d87a5930542bb84da15d295eff697",
    "aliases": {}
  },
  "pl-fcdc8e87f38a0a3a1e1be4ee9c83fe04": {
    "cover": "/skill-covers/pl-fcdc8e87f38a0a3a1e1be4ee9c83fe04.webp",
    "sourceTemplateId": "ad8a04e6a93b4b6fa64a92ce57c003d0",
    "aliases": {}
  },
  "pl-92e4bd41f45532b5334e5236989d2211": {
    "cover": "/skill-covers/pl-92e4bd41f45532b5334e5236989d2211.webp",
    "sourceTemplateId": "adeca7447fe54b5ab9a7ba008afc3e91",
    "aliases": {}
  },
  "pl-001ff2d28ef5a58289e077221f3b9f99": {
    "cover": "/production-library/editorial-covers/pl-001ff2d28ef5a58289e077221f3b9f99.webp",
    "sourceTemplateId": "aecb8455a16f45979d43470edb0c194b",
    "aliases": {}
  },
  "pl-80ba99b53b78e975734c239ca2de16ad": {
    "cover": "/skill-covers/pl-80ba99b53b78e975734c239ca2de16ad.webp",
    "sourceTemplateId": "aefea4cd9c3b43c3a0b507c023c23227",
    "aliases": {}
  },
  "pl-a6339b20230bfb8687bd91a3deea41f2": {
    "cover": "/skill-covers/pl-a6339b20230bfb8687bd91a3deea41f2.webp",
    "sourceTemplateId": "af9b73c4499845e29322e64739ed47a5",
    "aliases": {}
  },
  "pl-1535bb4e8e7359e004f6a756bcfb89e7": {
    "cover": "/skill-covers/pl-1535bb4e8e7359e004f6a756bcfb89e7.webp",
    "sourceTemplateId": "b0c54a8993bd49ccb7db899988b180c0",
    "aliases": {}
  },
  "pl-1606ddc5f6b274f8a70e1813f4227316": {
    "cover": "/skill-covers/pl-1606ddc5f6b274f8a70e1813f4227316.webp",
    "sourceTemplateId": "b11a4b03927a4ff893e5f36dd8463093",
    "aliases": {}
  },
  "pl-64b459b355130fd46e819bdd8c0e0244": {
    "cover": "/skill-covers/pl-64b459b355130fd46e819bdd8c0e0244.webp",
    "sourceTemplateId": "b1cd250becd84920b0ad5fbb91d83f2b",
    "aliases": {}
  },
  "pl-b2356f9c6de818bc6f6102526880654e": {
    "cover": "/skill-covers/pl-b2356f9c6de818bc6f6102526880654e.webp",
    "sourceTemplateId": "b210bac85e084a53b8d8d394caf77c7b",
    "aliases": {}
  },
  "pl-6f15522e8e19302281f2e069308a82bf": {
    "cover": "/skill-covers/pl-6f15522e8e19302281f2e069308a82bf.webp",
    "sourceTemplateId": "b2448e2b24164b0ba4b461080abcb924",
    "aliases": {}
  },
  "pl-262cce07e6d6aa9faf1dbb6934fa0f73": {
    "cover": "/skill-covers/pl-262cce07e6d6aa9faf1dbb6934fa0f73.webp",
    "sourceTemplateId": "b2828151518d443fab122bee262fb0a3",
    "aliases": {}
  },
  "pl-2bfa41f952886677ab184ec29eb9fc3a": {
    "cover": "/production-library/editorial-covers/pl-2bfa41f952886677ab184ec29eb9fc3a.webp",
    "sourceTemplateId": "b34633826a814c68a3786fb05cd5dc2b",
    "aliases": {}
  },
  "pl-79a36cd940a46aec75542c7c891e049d": {
    "cover": "/skill-covers/pl-79a36cd940a46aec75542c7c891e049d.webp",
    "sourceTemplateId": "b37af11897e540b7ac8875327facf0f6",
    "aliases": {}
  },
  "pl-3614325694afae3d708c20e2874524fd": {
    "cover": "/skill-covers/pl-3614325694afae3d708c20e2874524fd.webp",
    "sourceTemplateId": "b3f1b44eff4843d388927054c7979cda",
    "aliases": {}
  },
  "pl-f2eb6922f73fe357d87cbdb9c3c30f31": {
    "cover": "/skill-covers/pl-f2eb6922f73fe357d87cbdb9c3c30f31.webp",
    "sourceTemplateId": "b4231c38cbbd460985250715c5887ae9",
    "aliases": {}
  },
  "pl-2b29c62697196acd29a004b46754912f": {
    "cover": "/skill-covers/pl-2b29c62697196acd29a004b46754912f.webp",
    "sourceTemplateId": "b4bc9ca68156440fb77d70ff683722ff",
    "aliases": {}
  },
  "pl-c41fc29f191aea5d33ba3ac6aab8e173": {
    "cover": "/skill-covers/pl-c41fc29f191aea5d33ba3ac6aab8e173.webp",
    "sourceTemplateId": "b4d7e62d6eca4971ada59bc2ecd4fae8",
    "aliases": {}
  },
  "pl-88215e9609388cd4477dc2934129cac8": {
    "cover": "/skill-covers/pl-88215e9609388cd4477dc2934129cac8.webp",
    "sourceTemplateId": "b5aae5fc641446fdb10945279c2d6adf",
    "aliases": {}
  },
  "pl-ea16d6d8ca6e73c9fe573eff598ea4c9": {
    "cover": "/skill-covers/pl-ea16d6d8ca6e73c9fe573eff598ea4c9.webp",
    "sourceTemplateId": "b5b13d7cb1564a49a4e26d9653171f0f",
    "aliases": {}
  },
  "pl-b2b1a7cca5cea2db44501665df50f380": {
    "cover": "/skill-covers/pl-b2b1a7cca5cea2db44501665df50f380.webp",
    "sourceTemplateId": "b5c42583019f4ebc8eeee2b4ffc1a254",
    "aliases": {}
  },
  "pl-5ef6482083e7d79c355802c390de6a22": {
    "cover": "/skill-covers/pl-5ef6482083e7d79c355802c390de6a22.webp",
    "sourceTemplateId": "b6851d88327a48498748928e954fce67",
    "aliases": {}
  },
  "pl-47c4e822e8981b4f7e8c6f56f1cf4392": {
    "cover": "/skill-covers/pl-47c4e822e8981b4f7e8c6f56f1cf4392.webp",
    "sourceTemplateId": "b6c9c040fe294ceeb91b11d7d95dc232",
    "aliases": {}
  },
  "pl-a91b34b681e371a2263a737773561a33": {
    "cover": "/skill-covers/pl-a91b34b681e371a2263a737773561a33.webp",
    "sourceTemplateId": "b6d800fdea004a1c80282296c40a3b1a",
    "aliases": {}
  },
  "pl-4652749c292cd39f77b76bf7ec5b35d1": {
    "cover": "/skill-covers/pl-4652749c292cd39f77b76bf7ec5b35d1.webp",
    "sourceTemplateId": "b74fb20fe94743a5b95845ca214ddc06",
    "aliases": {}
  },
  "pl-76303a0b48348f596df7e9e4c8cd50a1": {
    "cover": "/skill-covers/pl-76303a0b48348f596df7e9e4c8cd50a1.webp",
    "sourceTemplateId": "b8dfb5ebd3b74be6a8406523a70cd204",
    "aliases": {}
  },
  "pl-e848873c41d405e553ce1bbe208d789b": {
    "cover": "/skill-covers/pl-e848873c41d405e553ce1bbe208d789b.webp",
    "sourceTemplateId": "b93a16ba87234df6bea895c699ed0438",
    "aliases": {}
  },
  "pl-9f2751fa4a29941b1d90c8a450e5f6b9": {
    "cover": "/production-library/editorial-covers/pl-9f2751fa4a29941b1d90c8a450e5f6b9.webp",
    "sourceTemplateId": "b96cf7b099354ad18b7a5ba254127782",
    "aliases": {}
  },
  "pl-37de3479ec63be62737e8a1276a4d0a6": {
    "cover": "/skill-covers/pl-37de3479ec63be62737e8a1276a4d0a6.webp",
    "sourceTemplateId": "b9a17cc1597141929682b344b3a9d711",
    "aliases": {}
  },
  "pl-c0b9c9a73b2d52768dc9418833f84ff0": {
    "cover": "/skill-covers/pl-c0b9c9a73b2d52768dc9418833f84ff0.webp",
    "sourceTemplateId": "b9a218e733d34f36a2975289dc2b0103",
    "aliases": {}
  },
  "pl-2a6ec5326ccb0581498e1ab60b5fdbfa": {
    "cover": "/skill-covers/pl-2a6ec5326ccb0581498e1ab60b5fdbfa.webp",
    "sourceTemplateId": "bb64aa4589b34d33a35b134a165aee15",
    "aliases": {}
  },
  "pl-5f2cef825b43eb4ff89cb96d454fef41": {
    "cover": "/skill-covers/pl-5f2cef825b43eb4ff89cb96d454fef41.webp",
    "sourceTemplateId": "bbac027c124a4448877a51ca18b478f8",
    "aliases": {}
  },
  "pl-44cd9170225231fdad9368ce74fafeed": {
    "cover": "/skill-covers/pl-44cd9170225231fdad9368ce74fafeed.webp",
    "sourceTemplateId": "bbd0308a119741fe92af4f8d0735af73",
    "aliases": {}
  },
  "pl-f0f7154e9bca2e35f74428c88c47bcdc": {
    "cover": "/skill-covers/pl-f0f7154e9bca2e35f74428c88c47bcdc.webp",
    "sourceTemplateId": "bc013d7dd8ad4a24826609cc481b5f2a",
    "aliases": {}
  },
  "pl-d191b13fd1f7c0485fef52b9b93b125b": {
    "cover": "/skill-covers/pl-d191b13fd1f7c0485fef52b9b93b125b.webp",
    "sourceTemplateId": "bdcddd87ec95440486f3cf8ab0f8f47a",
    "aliases": {}
  },
  "pl-ad187de3ee51edb1f745cb3884b97884": {
    "cover": "/skill-covers/pl-ad187de3ee51edb1f745cb3884b97884.webp",
    "sourceTemplateId": "be4ab1ef415146ef9eeb0111c789bf42",
    "aliases": {}
  },
  "pl-de71cec95f21ea0c82e8b2c0aa67922f": {
    "cover": "/skill-covers/pl-de71cec95f21ea0c82e8b2c0aa67922f.webp",
    "sourceTemplateId": "be4c1f4933cc438cafd5578b509e05b3",
    "aliases": {}
  },
  "pl-326a74081df62b25b2472ae95759a452": {
    "cover": "/skill-covers/pl-326a74081df62b25b2472ae95759a452.webp",
    "sourceTemplateId": "bf2c74e6a6c84cd39f42dbd67b9d2c75",
    "aliases": {}
  },
  "pl-2eac6a77c63eca4201876280cf3c6b92": {
    "cover": "/skill-covers/pl-2eac6a77c63eca4201876280cf3c6b92.webp",
    "sourceTemplateId": "bf81c18329d8484581c8244f87089509",
    "aliases": {}
  },
  "pl-cff255444bf3b40ad2a6564fb2a6a685": {
    "cover": "/skill-covers/pl-cff255444bf3b40ad2a6564fb2a6a685.webp",
    "sourceTemplateId": "bf927e90b83143a89c0e2ba13cf1ad4c",
    "aliases": {}
  },
  "pl-0a5660a3b5acb52680b3a213373680c0": {
    "cover": "/skill-covers/pl-0a5660a3b5acb52680b3a213373680c0.webp",
    "sourceTemplateId": "c01d4b8b8fc44778ab1680273ac3d17f",
    "aliases": {}
  },
  "pl-e96e8e7db8ef3d47340e518321cf6893": {
    "cover": "",
    "sourceTemplateId": "c1182f69459e43169e1c74a81562695c",
    "aliases": {}
  },
  "pl-b63b1a6ccf17800ac66c014c0173f73d": {
    "cover": "/skill-covers/pl-b63b1a6ccf17800ac66c014c0173f73d.webp",
    "sourceTemplateId": "c1325e4d750446ea86d288eefff435f7",
    "aliases": {}
  },
  "pl-48250fc673044c2985d6a674ccf7f896": {
    "cover": "/skill-covers/pl-48250fc673044c2985d6a674ccf7f896.webp",
    "sourceTemplateId": "c1fce2452583495c8a37f5a3697ba885",
    "aliases": {}
  },
  "pl-94cec6fb8a8ccb8d38390093cb691130": {
    "cover": "/skill-covers/pl-94cec6fb8a8ccb8d38390093cb691130.webp",
    "sourceTemplateId": "c295cbadca314803ade621a8b0a68705",
    "aliases": {}
  },
  "pl-86752ed6c6d9619a87b1092404383180": {
    "cover": "/skill-covers/pl-86752ed6c6d9619a87b1092404383180.webp",
    "sourceTemplateId": "c396f04665134e72bf68542ecad46868",
    "aliases": {}
  },
  "pl-afa75a63da125bca369eb5f70799b3a7": {
    "cover": "/skill-covers/pl-afa75a63da125bca369eb5f70799b3a7.webp",
    "sourceTemplateId": "c4521b3eb25d4f17ac68b87485bd0379",
    "aliases": {}
  },
  "pl-2470a533cc2e5c46ef0b96aafae37f97": {
    "cover": "/skill-covers/pl-2470a533cc2e5c46ef0b96aafae37f97.webp",
    "sourceTemplateId": "c4c038787aff4f1499bb61f64141404c",
    "aliases": {}
  },
  "pl-2fcdd715dce3988b2047853927a5ef04": {
    "cover": "/skill-covers/pl-2fcdd715dce3988b2047853927a5ef04.webp",
    "sourceTemplateId": "c647e7d1bec541118e7089347547ff72",
    "aliases": {}
  },
  "pl-35bb87956d3c202e7fea903585214049": {
    "cover": "/skill-covers/pl-35bb87956d3c202e7fea903585214049.webp",
    "sourceTemplateId": "c67a63ab95874675bea83105831cff08",
    "aliases": {}
  },
  "pl-07a24ea3dc5783c0dcfcb7a169cd9580": {
    "cover": "/skill-covers/pl-07a24ea3dc5783c0dcfcb7a169cd9580.webp",
    "sourceTemplateId": "c77d4b5852104d05a6bf36f6189b6afb",
    "aliases": {}
  },
  "pl-badab1ec0baa5e8639de97a3e45cff3c": {
    "cover": "/skill-covers/pl-badab1ec0baa5e8639de97a3e45cff3c.webp",
    "sourceTemplateId": "c80359769fa34a48b77b40ef5d592d1b",
    "aliases": {}
  },
  "pl-431e269a7600c14425da67949ac4698f": {
    "cover": "/skill-covers/pl-431e269a7600c14425da67949ac4698f.webp",
    "sourceTemplateId": "c89ec9e44cd542f9b1b59c7643183c40",
    "aliases": {}
  },
  "pl-371600ffe9a6ce36c38f71da8aa567e5": {
    "cover": "/skill-covers/pl-371600ffe9a6ce36c38f71da8aa567e5.webp",
    "sourceTemplateId": "c8b2e527387644cbb79a01c57773107f",
    "aliases": {}
  },
  "pl-18820d69c12d71ccb31ab2c9b7b79ca2": {
    "cover": "/skill-covers/pl-18820d69c12d71ccb31ab2c9b7b79ca2.webp",
    "sourceTemplateId": "c967619e37ab4adf99fec55dabe27b44",
    "aliases": {}
  },
  "pl-5ec7a45e32d578174a8291075490fd11": {
    "cover": "/skill-covers/pl-5ec7a45e32d578174a8291075490fd11.webp",
    "sourceTemplateId": "c96b775b652e4423a4979905d2074c2f",
    "aliases": {}
  },
  "pl-ecec81a0328c1436e72ce6b2acfb1e06": {
    "cover": "/skill-covers/pl-ecec81a0328c1436e72ce6b2acfb1e06.webp",
    "sourceTemplateId": "ca6a70cf31804e838db97a69db03c3f2",
    "aliases": {}
  },
  "pl-6f145bfbffa96398422f6681e8c81afd": {
    "cover": "/skill-covers/pl-6f145bfbffa96398422f6681e8c81afd.webp",
    "sourceTemplateId": "cace56ca693446588664a9622cd83a54",
    "aliases": {}
  },
  "pl-f440ce607e5d4648a709feaec8a4e7fb": {
    "cover": "/skill-covers/pl-f440ce607e5d4648a709feaec8a4e7fb.webp",
    "sourceTemplateId": "cae27be6d8d04763bdb533766506a6a2",
    "aliases": {}
  },
  "pl-8c0ab21b40d86a7cf2c11e5eeada496e": {
    "cover": "/skill-covers/pl-8c0ab21b40d86a7cf2c11e5eeada496e.webp",
    "sourceTemplateId": "cb53200a60524920b26eed481efa6f1c",
    "aliases": {}
  },
  "pl-5f75ebef024a7a34dd4d7607f6730128": {
    "cover": "/skill-covers/pl-5f75ebef024a7a34dd4d7607f6730128.webp",
    "sourceTemplateId": "cbbcacbd566b41d59ad5699672eb58df",
    "aliases": {}
  },
  "pl-ea877d64645742a22a9a4797be498a42": {
    "cover": "/skill-covers/pl-ea877d64645742a22a9a4797be498a42.webp",
    "sourceTemplateId": "ccf65762b0fa47738ff05927eca2bad1",
    "aliases": {}
  },
  "pl-41b1f69648ee559016f6d87306c35ad7": {
    "cover": "/skill-covers/pl-41b1f69648ee559016f6d87306c35ad7.webp",
    "sourceTemplateId": "cd6a62db6f874a208e8359ba07093795",
    "aliases": {}
  },
  "pl-6fb99dd09837e57c14d603eaa501338a": {
    "cover": "/skill-covers/pl-6fb99dd09837e57c14d603eaa501338a.webp",
    "sourceTemplateId": "cd860c301290429c837906f16023203a",
    "aliases": {}
  },
  "pl-e627ac3031d76f0ad13de0259b371505": {
    "cover": "/production-library/editorial-covers/pl-e627ac3031d76f0ad13de0259b371505.webp",
    "sourceTemplateId": "ce13353671d5403c8cb6cb10b373fd48",
    "aliases": {}
  },
  "pl-99e56f98dfa81cecd890b61d93ad8bb7": {
    "cover": "/skill-covers/pl-99e56f98dfa81cecd890b61d93ad8bb7.webp",
    "sourceTemplateId": "ce3ee16ce5c3428a8394e816981138c3",
    "aliases": {}
  },
  "pl-e19f9261c75d37ef21faf6372678850c": {
    "cover": "/skill-covers/pl-e19f9261c75d37ef21faf6372678850c.webp",
    "sourceTemplateId": "d08aea28285c4a7baf70c3e5a77048fb",
    "aliases": {}
  },
  "pl-db92672f909d320fdf24cd1bb6ca7395": {
    "cover": "/skill-covers/pl-db92672f909d320fdf24cd1bb6ca7395.webp",
    "sourceTemplateId": "d0df3e74ca4642009178dfa94048f40c",
    "aliases": {}
  },
  "pl-d11f35e75f0efec0db4c5ba33410a353": {
    "cover": "/skill-covers/pl-d11f35e75f0efec0db4c5ba33410a353.webp",
    "sourceTemplateId": "d1da5a3d320349c28d15f02ffa4e939a",
    "aliases": {}
  },
  "pl-25a3a303e0cdfa6aa590ed7d35c6cf46": {
    "cover": "/skill-covers/pl-25a3a303e0cdfa6aa590ed7d35c6cf46.webp",
    "sourceTemplateId": "d20fe35a62fd4f55a3a1cc9783aaf8d8",
    "aliases": {}
  },
  "pl-03df452f01ca5201e7c8e1696de00710": {
    "cover": "/skill-covers/pl-03df452f01ca5201e7c8e1696de00710.webp",
    "sourceTemplateId": "d22a9a6075014bde957f1506978464f1",
    "aliases": {}
  },
  "pl-8557651e5d4453725b087efb741897c2": {
    "cover": "/skill-covers/pl-8557651e5d4453725b087efb741897c2.webp",
    "sourceTemplateId": "d3d631025d624d01b6126566971c8fec",
    "aliases": {}
  },
  "pl-dac386b4de71a0c8bf538d113f23d12d": {
    "cover": "/skill-covers/pl-dac386b4de71a0c8bf538d113f23d12d.webp",
    "sourceTemplateId": "d3d9327cceab41218551bdf2a1967f13",
    "aliases": {}
  },
  "pl-5993b3f08870e6383c82e03a9fa11137": {
    "cover": "/skill-covers/pl-5993b3f08870e6383c82e03a9fa11137.webp",
    "sourceTemplateId": "d3f1d847e9b54d07a0ed5c61e74ccc0a",
    "aliases": {}
  },
  "pl-8c04da7bace2103af8dd4392e95bc47f": {
    "cover": "/production-library/editorial-covers/pl-8c04da7bace2103af8dd4392e95bc47f.webp",
    "sourceTemplateId": "d42fa88c6a7141289f4cd7dd8d3072bc",
    "aliases": {}
  },
  "pl-55f977d8d5559aab0e0d33355bd14cc9": {
    "cover": "/skill-covers/pl-55f977d8d5559aab0e0d33355bd14cc9.webp",
    "sourceTemplateId": "d51b345b85f64409b2856dd95a10f614",
    "aliases": {}
  },
  "pl-518c350e7fe1b1c10908dbda6004df2d": {
    "cover": "/skill-covers/pl-518c350e7fe1b1c10908dbda6004df2d.webp",
    "sourceTemplateId": "d559026bec674bd5803a8bebd803ee11",
    "aliases": {}
  },
  "pl-5aa90d859202c4ba728b6019e348a34b": {
    "cover": "/skill-covers/pl-5aa90d859202c4ba728b6019e348a34b.webp",
    "sourceTemplateId": "d5ede7ac2d104a968ea0daf7fa39e5eb",
    "aliases": {}
  },
  "pl-7932152e6a32d182953f8e4f302786be": {
    "cover": "/skill-covers/pl-7932152e6a32d182953f8e4f302786be.webp",
    "sourceTemplateId": "d634dc35cfe74554b8ba6de1560a93e6",
    "aliases": {}
  },
  "pl-ed39e220e26b15609d20eeb44d9ccb6a": {
    "cover": "/skill-covers/pl-ed39e220e26b15609d20eeb44d9ccb6a.webp",
    "sourceTemplateId": "d72ef2d3dbd043d286ede75db24c4d45",
    "aliases": {}
  },
  "pl-b94e604c4973637470bf3c6da91e2b7c": {
    "cover": "/skill-covers/pl-b94e604c4973637470bf3c6da91e2b7c.webp",
    "sourceTemplateId": "d80bf568fbad4c3799b08270d9fa31ec",
    "aliases": {}
  },
  "pl-fc8d4252925a23b308913a95c18fe9a9": {
    "cover": "/skill-covers/pl-fc8d4252925a23b308913a95c18fe9a9.webp",
    "sourceTemplateId": "d816be9ae89f441a9e2aebf2131cb29b",
    "aliases": {}
  },
  "pl-4435b9f4474274ff922d1384da42deb2": {
    "cover": "/production-library/editorial-covers/pl-4435b9f4474274ff922d1384da42deb2.webp",
    "sourceTemplateId": "d83da98cf1b04dda81d13a8855f01e4f",
    "aliases": {}
  },
  "pl-c488ecc059a940be6796de8c861cfefe": {
    "cover": "/skill-covers/pl-c488ecc059a940be6796de8c861cfefe.webp",
    "sourceTemplateId": "d86525b9ddd44410bc3e69d56cf6af96",
    "aliases": {}
  },
  "pl-7195edc5c216663d526e2533f46fab0b": {
    "cover": "/skill-covers/pl-7195edc5c216663d526e2533f46fab0b.webp",
    "sourceTemplateId": "d8721e4185334b5f9843e7f50ea8301c",
    "aliases": {}
  },
  "pl-1512244c29f5067e88bbcce8bc27fc5e": {
    "cover": "/skill-covers/pl-1512244c29f5067e88bbcce8bc27fc5e.webp",
    "sourceTemplateId": "d886bf832c39479faef544b050373ade",
    "aliases": {}
  },
  "pl-08f288f5d98046405cefc9e19ea436b1": {
    "cover": "/skill-covers/pl-08f288f5d98046405cefc9e19ea436b1.webp",
    "sourceTemplateId": "da829665419f4842bf1acdb746ff2b36",
    "aliases": {}
  },
  "pl-33c72a20aedb56b7aa6be1c340434920": {
    "cover": "/skill-covers/pl-33c72a20aedb56b7aa6be1c340434920.webp",
    "sourceTemplateId": "dafb9f4c93c54c1290680a32071fe129",
    "aliases": {}
  },
  "pl-2716195c118a33ad5ab6188355e45c84": {
    "cover": "/skill-covers/pl-2716195c118a33ad5ab6188355e45c84.webp",
    "sourceTemplateId": "db21d5a319934b26be404baba84bb1c7",
    "aliases": {}
  },
  "pl-eb207e27ed17d77ff0924ab5d3f993ab": {
    "cover": "/skill-covers/pl-eb207e27ed17d77ff0924ab5d3f993ab.webp",
    "sourceTemplateId": "dd2f39ab8fc14d188e3c90e00e48582d",
    "aliases": {}
  },
  "pl-5772864f04390734b41e935fcc88bb52": {
    "cover": "/skill-covers/pl-5772864f04390734b41e935fcc88bb52.webp",
    "sourceTemplateId": "ddffc5bea9fd4136ac6efba6257e42c9",
    "aliases": {}
  },
  "pl-c0760b9fbad91bba31df4bf46d9724a7": {
    "cover": "/skill-covers/pl-c0760b9fbad91bba31df4bf46d9724a7.webp",
    "sourceTemplateId": "de3d5a320add4083be40d52e7260efe4",
    "aliases": {}
  },
  "pl-483b50059df4292cd4229a1e2d1b3c67": {
    "cover": "/skill-covers/pl-483b50059df4292cd4229a1e2d1b3c67.webp",
    "sourceTemplateId": "df6d1b6a73d1422aa87eb490c301105b",
    "aliases": {}
  },
  "pl-1fdfa1bacc31693e10c4fce1f476d787": {
    "cover": "/skill-covers/pl-1fdfa1bacc31693e10c4fce1f476d787.webp",
    "sourceTemplateId": "dfb9f9dc418e4163a9809ecea235d0df",
    "aliases": {}
  },
  "pl-c895641ee5bfced2b034f2a7631dafb0": {
    "cover": "/skill-covers/pl-c895641ee5bfced2b034f2a7631dafb0.webp",
    "sourceTemplateId": "e0410be4e59e416aa619169e718be610",
    "aliases": {}
  },
  "pl-de74c42897499771b940d213072ebeee": {
    "cover": "/skill-covers/pl-de74c42897499771b940d213072ebeee.webp",
    "sourceTemplateId": "e0a7fe04cacb492893ddf412056fc4c9",
    "aliases": {}
  },
  "pl-b9f734d866b21ce7ac2323b340221bc9": {
    "cover": "/skill-covers/pl-b9f734d866b21ce7ac2323b340221bc9.webp",
    "sourceTemplateId": "e223aeb654594b35b261a016e70b7d31",
    "aliases": {}
  },
  "pl-2def5dc19e03a703cdde478c5c35c1c0": {
    "cover": "/skill-covers/pl-2def5dc19e03a703cdde478c5c35c1c0.webp",
    "sourceTemplateId": "e2a700ac641343b5aa6daca97eee2d11",
    "aliases": {}
  },
  "pl-2d78fa4f7f9daa2af1cb3db29391d193": {
    "cover": "/skill-covers/pl-2d78fa4f7f9daa2af1cb3db29391d193.webp",
    "sourceTemplateId": "e2f70558d90446e4b33f271d9508440f",
    "aliases": {
      "references/deliverable-template.md": "deliverable-template.md",
      "references/examples.md": "examples.md",
      "references/research-notes.md": "research-notes.md"
    }
  },
  "pl-9665d3ecea9dbc64d0475a78419a37ea": {
    "cover": "/skill-covers/pl-9665d3ecea9dbc64d0475a78419a37ea.webp",
    "sourceTemplateId": "e3bf1cc939dd43c7825154df90c1d1ab",
    "aliases": {}
  },
  "pl-5652e6c6e77ccd86478bb61eff1bade0": {
    "cover": "/skill-covers/pl-5652e6c6e77ccd86478bb61eff1bade0.webp",
    "sourceTemplateId": "e3e09b5f1c1b4ce1858cb64cd448253c",
    "aliases": {}
  },
  "pl-8b48a3bc8a4ac1aeec2f0091394c2d09": {
    "cover": "/skill-covers/pl-8b48a3bc8a4ac1aeec2f0091394c2d09.webp",
    "sourceTemplateId": "e470a6125e0742d18724dcdc4fde3e54",
    "aliases": {}
  },
  "pl-41213487b25a604e1cdddc865a0cd800": {
    "cover": "/skill-covers/pl-41213487b25a604e1cdddc865a0cd800.webp",
    "sourceTemplateId": "e4c0b880a79642db8c91105faa0d17b9",
    "aliases": {}
  },
  "pl-8b77696e4c9867ab77d3cc7fc33a6d81": {
    "cover": "/skill-covers/pl-8b77696e4c9867ab77d3cc7fc33a6d81.webp",
    "sourceTemplateId": "e4ddc5dab49c4f0b964d422245e2472f",
    "aliases": {}
  },
  "pl-377d287529849b72c661db23a37c1c75": {
    "cover": "/skill-covers/pl-377d287529849b72c661db23a37c1c75.webp",
    "sourceTemplateId": "e600f971dc0b47f9bab23312673fc2f4",
    "aliases": {}
  },
  "pl-93193d1aba9fac7c5c3ab099a74fcd4c": {
    "cover": "/skill-covers/pl-93193d1aba9fac7c5c3ab099a74fcd4c.webp",
    "sourceTemplateId": "e628b5b368914f758f1b22c1a5aee987",
    "aliases": {}
  },
  "pl-be9130a280a20b83d8f3db1b86ceba1d": {
    "cover": "/skill-covers/pl-be9130a280a20b83d8f3db1b86ceba1d.webp",
    "sourceTemplateId": "e6cb82939590420d8f0d433859da6ab1",
    "aliases": {}
  },
  "pl-02ef4409822fab6ba50a990765f4c453": {
    "cover": "/skill-covers/pl-02ef4409822fab6ba50a990765f4c453.webp",
    "sourceTemplateId": "e6d35f6b55fe46ef9388b5c1458e610a",
    "aliases": {}
  },
  "pl-28587ad4db161d8a900e1ed2032285cf": {
    "cover": "/skill-covers/pl-28587ad4db161d8a900e1ed2032285cf.webp",
    "sourceTemplateId": "e717760be4f74b168d7e7624faa69ded",
    "aliases": {}
  },
  "pl-ed9370a34168661f454f594763df4b3b": {
    "cover": "/skill-covers/pl-ed9370a34168661f454f594763df4b3b.webp",
    "sourceTemplateId": "e87fc5ac99a64e7793bfe03f6933bb73",
    "aliases": {}
  },
  "pl-6b8127e9e5093d5be7776fd27752b540": {
    "cover": "/skill-covers/pl-6b8127e9e5093d5be7776fd27752b540.webp",
    "sourceTemplateId": "e9635f87f3854d609c834e2499941379",
    "aliases": {}
  },
  "pl-afe23dcf91f1b5de5ddcdd698b4e1313": {
    "cover": "/skill-covers/pl-afe23dcf91f1b5de5ddcdd698b4e1313.webp",
    "sourceTemplateId": "e9c6d4ccbfa34949850c8d2ae01e90ba",
    "aliases": {}
  },
  "pl-5242d99b51cff26628d739bf94ef86db": {
    "cover": "/skill-covers/pl-5242d99b51cff26628d739bf94ef86db.webp",
    "sourceTemplateId": "ea4107736e484d8da468eaf1717b2dea",
    "aliases": {}
  },
  "pl-944c23690309b303e7f00d3970bdd3ba": {
    "cover": "/production-library/editorial-covers/pl-944c23690309b303e7f00d3970bdd3ba.webp",
    "sourceTemplateId": "ea758e93bbf3490c9de4e8bacd43db43",
    "aliases": {}
  },
  "pl-90effef9aac4f5aabce315fcd38ec2db": {
    "cover": "/skill-covers/pl-90effef9aac4f5aabce315fcd38ec2db.webp",
    "sourceTemplateId": "ea9ca2f67aed47d3a4cd87511b4f3f3c",
    "aliases": {}
  },
  "pl-0c4c7f70bdfc652b4e4caa93cae01363": {
    "cover": "/skill-covers/pl-0c4c7f70bdfc652b4e4caa93cae01363.webp",
    "sourceTemplateId": "eaab14a475a34cfa936f9364ffd315d2",
    "aliases": {}
  },
  "pl-29505bea758339cc1e017687d3b5c96f": {
    "cover": "/skill-covers/pl-29505bea758339cc1e017687d3b5c96f.webp",
    "sourceTemplateId": "ead6f65b349e422591ea9848981949b6",
    "aliases": {}
  },
  "pl-7356824b581f50366b51e7c1b535fd45": {
    "cover": "/production-library/editorial-covers/pl-7356824b581f50366b51e7c1b535fd45.webp",
    "sourceTemplateId": "ebfce03188e54632b01ff07f68a01f4d",
    "aliases": {}
  },
  "pl-c3b0eb4abbfabbdacfe772ddc7791550": {
    "cover": "",
    "sourceTemplateId": "ec09e45d72f74c2aac3c92863a7f93eb",
    "aliases": {}
  },
  "pl-3f3a41f0cc21cce821d185d285cb9d31": {
    "cover": "/skill-covers/pl-3f3a41f0cc21cce821d185d285cb9d31.webp",
    "sourceTemplateId": "ec27095b4c144af5a8a3c846ad2fe5df",
    "aliases": {}
  },
  "pl-63b579b77a851ed3526ce5d51cad5cb9": {
    "cover": "/skill-covers/pl-63b579b77a851ed3526ce5d51cad5cb9.webp",
    "sourceTemplateId": "ec46588abc9044b3ad454865e1f3dd92",
    "aliases": {}
  },
  "pl-1281f00f2a4b8f005c5c9c0b4b5b93b8": {
    "cover": "/skill-covers/pl-1281f00f2a4b8f005c5c9c0b4b5b93b8.webp",
    "sourceTemplateId": "ed6b15b7cb20423ea6b129a634c06472",
    "aliases": {}
  },
  "pl-59a2dfb4304bc485e4bf13c5efcb077c": {
    "cover": "/skill-covers/pl-59a2dfb4304bc485e4bf13c5efcb077c.webp",
    "sourceTemplateId": "edf9c1dd595340c3aaf848023e013f1a",
    "aliases": {}
  },
  "pl-c5c7b66c6d8b6bddf995d42b8e943790": {
    "cover": "/skill-covers/pl-c5c7b66c6d8b6bddf995d42b8e943790.webp",
    "sourceTemplateId": "ee3bf67952e442b8b6f42317ccc28e4e",
    "aliases": {}
  },
  "pl-a6a8f3f0457426b9ff00596a470afe7e": {
    "cover": "/skill-covers/pl-a6a8f3f0457426b9ff00596a470afe7e.webp",
    "sourceTemplateId": "ee68383d5bfb487ca8626f966a9c57b3",
    "aliases": {}
  },
  "pl-79396fc05c7dd9ee7bd91efa20eb9c34": {
    "cover": "/skill-covers/pl-79396fc05c7dd9ee7bd91efa20eb9c34.webp",
    "sourceTemplateId": "eed45f1ef5374db99f3794fb2118fd74",
    "aliases": {}
  },
  "pl-160991fb4768b754bfab8d2618e3a073": {
    "cover": "/skill-covers/pl-160991fb4768b754bfab8d2618e3a073.webp",
    "sourceTemplateId": "eefb2a7f02834c34a7a611ffddfc1770",
    "aliases": {}
  },
  "pl-7cc749c04e61cc5f0a33d62a4dab15ea": {
    "cover": "/skill-covers/pl-7cc749c04e61cc5f0a33d62a4dab15ea.webp",
    "sourceTemplateId": "efcf2778b13144d5bda904bc95e6f118",
    "aliases": {}
  },
  "pl-b5217cee5f170c1d55a355e10ba001b5": {
    "cover": "/skill-covers/pl-b5217cee5f170c1d55a355e10ba001b5.webp",
    "sourceTemplateId": "efde24b727c243159e431601eae62133",
    "aliases": {}
  },
  "pl-0513712ad870aeee075b69082232f113": {
    "cover": "/skill-covers/pl-0513712ad870aeee075b69082232f113.webp",
    "sourceTemplateId": "f021afd4530a4d2e9efc2a88ce904a59",
    "aliases": {}
  },
  "pl-7c1664d4ed15e6f842e61dd159211b57": {
    "cover": "/skill-covers/pl-7c1664d4ed15e6f842e61dd159211b57.webp",
    "sourceTemplateId": "f08ce6a5076d47e8817ecf96aada199b",
    "aliases": {}
  },
  "pl-735ed6247e353f96b26a39c6b8b55698": {
    "cover": "/skill-covers/pl-735ed6247e353f96b26a39c6b8b55698.webp",
    "sourceTemplateId": "f13054b3698047b184ae66481e5509d7",
    "aliases": {}
  },
  "pl-50b262b12fe35f36b30aebfbe008b81e": {
    "cover": "/skill-covers/pl-50b262b12fe35f36b30aebfbe008b81e.webp",
    "sourceTemplateId": "f152278954464ce1a425f74791763846",
    "aliases": {}
  },
  "pl-315fee1b0ee335101353a6ddd355632c": {
    "cover": "/skill-covers/pl-315fee1b0ee335101353a6ddd355632c.webp",
    "sourceTemplateId": "f18e072f4af4493a83631056a5d9fa10",
    "aliases": {}
  },
  "pl-7ff0b471e828873817e9765fcc09fdf9": {
    "cover": "/skill-covers/pl-7ff0b471e828873817e9765fcc09fdf9.webp",
    "sourceTemplateId": "f1ced93e098a4dd88a3d013325b0e967",
    "aliases": {}
  },
  "pl-85fbc58228e422a2c2ee68c0c81cfcaa": {
    "cover": "/skill-covers/pl-85fbc58228e422a2c2ee68c0c81cfcaa.webp",
    "sourceTemplateId": "f1e501c7929345ae9f4a87de64ce482b",
    "aliases": {}
  },
  "pl-3a376ebf6f594acbfc0c2242651b5534": {
    "cover": "/production-library/editorial-covers/pl-3a376ebf6f594acbfc0c2242651b5534.webp",
    "sourceTemplateId": "f1f568b7399b41059006bfe91d5755ae",
    "aliases": {}
  },
  "pl-5bd27a5864e136ed0f16c60429d033e5": {
    "cover": "/skill-covers/pl-5bd27a5864e136ed0f16c60429d033e5.webp",
    "sourceTemplateId": "f2968280a15941018b19ba9956713cb2",
    "aliases": {}
  },
  "pl-8bdd1bc20bc8e3c9cc959e06df149748": {
    "cover": "/skill-covers/pl-8bdd1bc20bc8e3c9cc959e06df149748.webp",
    "sourceTemplateId": "f29a6e5f542845b4a5403fae1f9d4880",
    "aliases": {}
  },
  "pl-71f216efc337efa5ec0a1e0d505cec00": {
    "cover": "/skill-covers/pl-71f216efc337efa5ec0a1e0d505cec00.webp",
    "sourceTemplateId": "f2f0824cd8134743b6a12ff8fb5d9ec3",
    "aliases": {}
  },
  "pl-3cb34172173a4368e7844042183de0d6": {
    "cover": "/skill-covers/pl-3cb34172173a4368e7844042183de0d6.webp",
    "sourceTemplateId": "f32bbc6374774088bc07bf4aab625653",
    "aliases": {}
  },
  "pl-6e53a1ba071711bd7eb39d6172fe6404": {
    "cover": "/skill-covers/pl-6e53a1ba071711bd7eb39d6172fe6404.webp",
    "sourceTemplateId": "f3965d933dde4b9d8c20e3445afd28c4",
    "aliases": {}
  },
  "pl-6667374d2bb807499cfa69307e5f1b32": {
    "cover": "/skill-covers/pl-6667374d2bb807499cfa69307e5f1b32.webp",
    "sourceTemplateId": "f4c5dfce68484376b7b0a31f7508b019",
    "aliases": {
      "references/10-电影美学风格映射表.md": "knowledge-base/10-电影美学风格映射表.md",
      "references/11-风格锁定与注入机制.md": "knowledge-base/11-风格锁定与注入机制.md"
    }
  },
  "pl-140c6570dcb362e7a74bad2d903a94a7": {
    "cover": "/skill-covers/pl-140c6570dcb362e7a74bad2d903a94a7.webp",
    "sourceTemplateId": "f67fef20b6534b1bab232571749c053a",
    "aliases": {}
  },
  "pl-b2cd4c1f6bf095804fb32ea44e731734": {
    "cover": "/skill-covers/pl-b2cd4c1f6bf095804fb32ea44e731734.webp",
    "sourceTemplateId": "f713f2d3f9854b02bb76c7c412c8f113",
    "aliases": {}
  },
  "pl-5f551f28e390a8adc89454d99103860e": {
    "cover": "/skill-covers/pl-5f551f28e390a8adc89454d99103860e.webp",
    "sourceTemplateId": "f7a068bc852e498fb2081d759ef83157",
    "aliases": {}
  },
  "pl-117f63860de2cdabcc3d74f503fff4a1": {
    "cover": "/skill-covers/pl-117f63860de2cdabcc3d74f503fff4a1.webp",
    "sourceTemplateId": "f7acac6915a9422aa3deb4ff5afb1e1e",
    "aliases": {}
  },
  "pl-ca4be55ce9254e6a0903b013e379ac06": {
    "cover": "/skill-covers/pl-ca4be55ce9254e6a0903b013e379ac06.webp",
    "sourceTemplateId": "f99aa004d4c6465e83b1212cc6faed61",
    "aliases": {}
  },
  "pl-687cdf18b1789f707a5a6c38402983a7": {
    "cover": "/skill-covers/pl-687cdf18b1789f707a5a6c38402983a7.webp",
    "sourceTemplateId": "fb44789a1ee84a5db924ef9c65e3275c",
    "aliases": {}
  },
  "pl-78c23e6d7116a99822b824d9f1a9e45c": {
    "cover": "/skill-covers/pl-78c23e6d7116a99822b824d9f1a9e45c.webp",
    "sourceTemplateId": "fb8b83dcd6994ecba6487466e27b881d",
    "aliases": {}
  },
  "pl-78dd0b4ae020ead0df2b5898275d9b32": {
    "cover": "/skill-covers/pl-78dd0b4ae020ead0df2b5898275d9b32.webp",
    "sourceTemplateId": "fc0fb53f1d5b40a885fbb6b68bb86bb1",
    "aliases": {}
  },
  "pl-849e553a50e4550df063f855f876bfee": {
    "cover": "/skill-covers/pl-849e553a50e4550df063f855f876bfee.webp",
    "sourceTemplateId": "fc546cfbc31e40b2ac99e0ae8f24fc8d",
    "aliases": {}
  },
  "pl-d8d0ea8c86770cf1d09f64f15351a3b2": {
    "cover": "/skill-covers/pl-d8d0ea8c86770cf1d09f64f15351a3b2.webp",
    "sourceTemplateId": "fcc38fc7ad8146cab4dc3de9081ccc42",
    "aliases": {}
  },
  "pl-23a90a96aacbeb8c7d627555bc2c24d9": {
    "cover": "/skill-covers/pl-23a90a96aacbeb8c7d627555bc2c24d9.webp",
    "sourceTemplateId": "fe17bf8cb6c6459ebd748705d213abe3",
    "aliases": {}
  },
  "pl-e7a4caf6f4855ac9e7d577a54a1da7a1": {
    "cover": "/skill-covers/pl-e7a4caf6f4855ac9e7d577a54a1da7a1.webp",
    "sourceTemplateId": "fe2143e9335b4aa2969f9bc1ae89024e",
    "aliases": {}
  },
  "pl-c5f6e95fe1990617b08cc13d6fe5343a": {
    "cover": "/skill-covers/pl-c5f6e95fe1990617b08cc13d6fe5343a.webp",
    "sourceTemplateId": "fe9d5b6b18054732ab6328758e5d9319",
    "aliases": {}
  },
  "pl-e66d93d249732c4fb2327818a05c70f6": {
    "cover": "/skill-covers/pl-e66d93d249732c4fb2327818a05c70f6.webp",
    "sourceTemplateId": "ff31e354f158449b975a7c23352d1d83",
    "aliases": {}
  },
  "pl-fd695d107fd01442b156b5e996a76d30": {
    "cover": "/skill-covers/pl-fd695d107fd01442b156b5e996a76d30.webp",
    "sourceTemplateId": "ff5689d5e8d94b71a28bf3b5d2901832",
    "aliases": {}
  },
  "pl-28fe7b3096dd595b6f54fb7ecd18ca28": {
    "cover": "/skill-covers/pl-28fe7b3096dd595b6f54fb7ecd18ca28.webp",
    "sourceTemplateId": "ffac0170924a4cba8629666aee89e61d",
    "aliases": {}
  },
  "pl-dd122b8a84d9e552e96afda9e2dd6389": {
    "cover": "/skill-covers/pl-dd122b8a84d9e552e96afda9e2dd6389.webp",
    "sourceTemplateId": "ffc114a90f524d00a5fa840b6350d995",
    "aliases": {}
  },
  "14811816982028": {
    "cover": "/skill-covers/14811816982028.webp",
    "sourceTemplateId": "14811816982028",
    "aliases": {}
  },
  "14811816960524": {
    "cover": "/skill-covers/14811816960524.webp",
    "sourceTemplateId": "14811816960524",
    "aliases": {}
  },
  "14811816969484": {
    "cover": "/skill-covers/14811816969484.webp",
    "sourceTemplateId": "14811816969484",
    "aliases": {}
  },
  "14811816969740": {
    "cover": "/skill-covers/14811816969740.webp",
    "sourceTemplateId": "14811816969740",
    "aliases": {}
  },
  "14811816969996": {
    "cover": "/skill-covers/14811816969996.webp",
    "sourceTemplateId": "14811816969996",
    "aliases": {}
  },
  "14811816981004": {
    "cover": "/skill-covers/14811816981004.webp",
    "sourceTemplateId": "14811816981004",
    "aliases": {}
  },
  "14811816981260": {
    "cover": "/skill-covers/14811816981260.webp",
    "sourceTemplateId": "14811816981260",
    "aliases": {}
  },
  "14889292801804": {
    "cover": "/skill-covers/14889292801804.webp",
    "sourceTemplateId": "14889292801804",
    "aliases": {}
  },
  "14811816970508": {
    "cover": "/skill-covers/14811816970508.webp",
    "sourceTemplateId": "14811816970508",
    "aliases": {}
  },
  "14811816981772": {
    "cover": "/skill-covers/14811816981772.webp",
    "sourceTemplateId": "14811816981772",
    "aliases": {}
  },
  "14811816970252": {
    "cover": "/skill-covers/14811816970252.webp",
    "sourceTemplateId": "14811816970252",
    "aliases": {}
  },
  "14811816982540": {
    "cover": "/skill-covers/14811816982540.webp",
    "sourceTemplateId": "14811816982540",
    "aliases": {}
  },
  "14889899552012": {
    "cover": "/skill-covers/14889899552012.webp",
    "sourceTemplateId": "14889899552012",
    "aliases": {}
  },
  "14811816983052": {
    "cover": "/skill-covers/14811816983052.webp",
    "sourceTemplateId": "14811816983052",
    "aliases": {}
  },
  "14811816982796": {
    "cover": "/skill-covers/14811816982796.webp",
    "sourceTemplateId": "14811816982796",
    "aliases": {}
  },
  "14811816982284": {
    "cover": "/skill-covers/14811816982284.webp",
    "sourceTemplateId": "14811816982284",
    "aliases": {}
  },
  "14811816983308": {
    "cover": "/skill-covers/14811816983308.webp",
    "sourceTemplateId": "14811816983308",
    "aliases": {}
  },
  "14519800321292": {
    "cover": "/skill-covers/14519800321292.webp",
    "sourceTemplateId": "14519800321292",
    "aliases": {}
  },
  "14811816960780": {
    "cover": "/skill-covers/14811816960780.webp",
    "sourceTemplateId": "14811816960780",
    "aliases": {}
  },
  "14811816962060": {
    "cover": "/skill-covers/14811816962060.webp",
    "sourceTemplateId": "14811816962060",
    "aliases": {}
  },
  "14811816962316": {
    "cover": "/skill-covers/14811816962316.webp",
    "sourceTemplateId": "14811816962316",
    "aliases": {}
  },
  "14811816962572": {
    "cover": "/skill-covers/14811816962572.webp",
    "sourceTemplateId": "14811816962572",
    "aliases": {}
  },
  "14889292802060": {
    "cover": "/skill-covers/14889292802060.webp",
    "sourceTemplateId": "14889292802060",
    "aliases": {}
  },
  "14811816961036": {
    "cover": "/skill-covers/14811816961036.webp",
    "sourceTemplateId": "14811816961036",
    "aliases": {}
  },
  "14811816981516": {
    "cover": "/skill-covers/14811816981516.webp",
    "sourceTemplateId": "14811816981516",
    "aliases": {}
  },
  "14889899551756": {
    "cover": "/skill-covers/14889899551756.webp",
    "sourceTemplateId": "14889899551756",
    "aliases": {}
  },
  "14811816980748": {
    "cover": "/skill-covers/14811816980748.webp",
    "sourceTemplateId": "14811816980748",
    "aliases": {}
  },
  "14811816960268": {
    "cover": "/skill-covers/14811816960268.webp",
    "sourceTemplateId": "14811816960268",
    "aliases": {}
  },
  "15215320902412": {
    "cover": "/skill-covers/15215320902412.webp",
    "sourceTemplateId": "15215320902412",
    "aliases": {}
  },
  "15434297644556": {
    "cover": "/skill-covers/15434297644556.webp",
    "sourceTemplateId": "15434297644556",
    "aliases": {}
  },
  "14811816961804": {
    "cover": "/skill-covers/14811816961804.webp",
    "sourceTemplateId": "14811816961804",
    "aliases": {}
  },
  "15507072002828": {
    "cover": "/skill-covers/15507072002828.webp",
    "sourceTemplateId": "15507072002828",
    "aliases": {}
  },
  "14811816961292": {
    "cover": "/skill-covers/14811816961292.webp",
    "sourceTemplateId": "14811816961292",
    "aliases": {}
  },
  "pl-f8e94aea24c4d7fa010cd668d81d195b": {
    "cover": "/production-library/editorial-covers/pl-f8e94aea24c4d7fa010cd668d81d195b.webp",
    "sourceTemplateId": "pl-f8e94aea24c4d7fa010cd668d81d195b",
    "aliases": {}
  },
  "pl-c89a235131a9fb716691a9300a1980e0": {
    "cover": "/production-library/editorial-covers/pl-c89a235131a9fb716691a9300a1980e0.webp",
    "sourceTemplateId": "pl-c89a235131a9fb716691a9300a1980e0",
    "aliases": {}
  },
  "pl-662a45a92f543e4482a28bc3a803871c": {
    "cover": "/production-library/editorial-covers/pl-662a45a92f543e4482a28bc3a803871c.webp",
    "sourceTemplateId": "pl-662a45a92f543e4482a28bc3a803871c",
    "aliases": {}
  },
  "pl-6ee750bbc9b731050bead30797211792": {
    "cover": "/production-library/editorial-covers/pl-6ee750bbc9b731050bead30797211792.webp",
    "sourceTemplateId": "pl-6ee750bbc9b731050bead30797211792",
    "aliases": {}
  },
  "pl-48a690d165fc646441d8357a3524f4c0": {
    "cover": "/production-library/editorial-covers/pl-48a690d165fc646441d8357a3524f4c0.webp",
    "sourceTemplateId": "pl-48a690d165fc646441d8357a3524f4c0",
    "aliases": {}
  },
  "pl-ea47767207aa40b5de0e5b5d428bfbca": {
    "cover": "/production-library/editorial-covers/pl-ea47767207aa40b5de0e5b5d428bfbca.webp",
    "sourceTemplateId": "pl-ea47767207aa40b5de0e5b5d428bfbca",
    "aliases": {}
  },
  "pl-3319eea0ea1f374f8c0fb21c0a1bb3d9": {
    "cover": "/production-library/editorial-covers/pl-3319eea0ea1f374f8c0fb21c0a1bb3d9.webp",
    "sourceTemplateId": "pl-3319eea0ea1f374f8c0fb21c0a1bb3d9",
    "aliases": {}
  },
  "pl-e56d77452c1534cb638d863cf0260ccd": {
    "cover": "/production-library/editorial-covers/pl-e56d77452c1534cb638d863cf0260ccd.webp",
    "sourceTemplateId": "pl-e56d77452c1534cb638d863cf0260ccd",
    "aliases": {}
  },
  "pl-21cf56feee8fa03e5f007e61a0e4c016": {
    "cover": "/production-library/editorial-covers/pl-21cf56feee8fa03e5f007e61a0e4c016.webp",
    "sourceTemplateId": "pl-21cf56feee8fa03e5f007e61a0e4c016",
    "aliases": {}
  },
  "pl-77e5ecd8c05df4c1f38d6fbb57446f30": {
    "cover": "/production-library/editorial-covers/pl-77e5ecd8c05df4c1f38d6fbb57446f30.webp",
    "sourceTemplateId": "pl-77e5ecd8c05df4c1f38d6fbb57446f30",
    "aliases": {}
  },
  "pl-c9c0469c9bca978fa79dcf5a4eca4343": {
    "cover": "/production-library/editorial-covers/pl-c9c0469c9bca978fa79dcf5a4eca4343.webp",
    "sourceTemplateId": "pl-c9c0469c9bca978fa79dcf5a4eca4343",
    "aliases": {}
  },
  "pl-af0da7421c3a92baa8904a465ea96343": {
    "cover": "/production-library/editorial-covers/pl-af0da7421c3a92baa8904a465ea96343.webp",
    "sourceTemplateId": "pl-af0da7421c3a92baa8904a465ea96343",
    "aliases": {}
  },
  "pl-32c1d9a416c9ae0bbd6f08998eb0ec0c": {
    "cover": "/production-library/editorial-covers/pl-32c1d9a416c9ae0bbd6f08998eb0ec0c.webp",
    "sourceTemplateId": "pl-32c1d9a416c9ae0bbd6f08998eb0ec0c",
    "aliases": {}
  },
  "pl-5ae385501ed5f394e0f69efe4732e03d": {
    "cover": "/production-library/editorial-covers/pl-5ae385501ed5f394e0f69efe4732e03d.webp",
    "sourceTemplateId": "pl-5ae385501ed5f394e0f69efe4732e03d",
    "aliases": {}
  },
  "pl-405b5324d0e13920fca2e3511c163c27": {
    "cover": "/production-library/editorial-covers/pl-405b5324d0e13920fca2e3511c163c27.webp",
    "sourceTemplateId": "pl-405b5324d0e13920fca2e3511c163c27",
    "aliases": {}
  },
  "pl-150cbfb9131c78145ede6df528957248": {
    "cover": "/production-library/editorial-covers/pl-150cbfb9131c78145ede6df528957248.webp",
    "sourceTemplateId": "pl-150cbfb9131c78145ede6df528957248",
    "aliases": {}
  },
  "pl-dc1544c9b883ad2330118442ee20b6cb": {
    "cover": "/production-library/editorial-covers/pl-dc1544c9b883ad2330118442ee20b6cb.webp",
    "sourceTemplateId": "pl-dc1544c9b883ad2330118442ee20b6cb",
    "aliases": {}
  },
  "pl-d2dc7991cdb852b6a8880f0ce9ef7720": {
    "cover": "/production-library/editorial-covers/pl-d2dc7991cdb852b6a8880f0ce9ef7720.webp",
    "sourceTemplateId": "pl-d2dc7991cdb852b6a8880f0ce9ef7720",
    "aliases": {}
  },
  "pl-e58905cc53517dc4d103a7badedaa7b2": {
    "cover": "/production-library/editorial-covers/pl-e58905cc53517dc4d103a7badedaa7b2.webp",
    "sourceTemplateId": "pl-e58905cc53517dc4d103a7badedaa7b2",
    "aliases": {}
  },
  "pl-0ceb5f9bf0210e02c5054ea3f55d54d9": {
    "cover": "/production-library/editorial-covers/pl-0ceb5f9bf0210e02c5054ea3f55d54d9.webp",
    "sourceTemplateId": "pl-0ceb5f9bf0210e02c5054ea3f55d54d9",
    "aliases": {}
  },
  "pl-82862297b51e40b231e36f4ec690633b": {
    "cover": "/production-library/editorial-covers/pl-82862297b51e40b231e36f4ec690633b.webp",
    "sourceTemplateId": "pl-82862297b51e40b231e36f4ec690633b",
    "aliases": {}
  },
  "pl-ca322ac6b4895fee962a7ce5dd5be70d": {
    "cover": "/production-library/editorial-covers/pl-ca322ac6b4895fee962a7ce5dd5be70d.webp",
    "sourceTemplateId": "pl-ca322ac6b4895fee962a7ce5dd5be70d",
    "aliases": {}
  },
  "pl-faf05438b867177067cf02e8871b9ea1": {
    "cover": "/production-library/editorial-covers/pl-faf05438b867177067cf02e8871b9ea1.webp",
    "sourceTemplateId": "pl-faf05438b867177067cf02e8871b9ea1",
    "aliases": {}
  },
  "pl-18dd2ae739d7a9f1453028786c9e2359": {
    "cover": "/production-library/editorial-covers/pl-18dd2ae739d7a9f1453028786c9e2359.webp",
    "sourceTemplateId": "pl-18dd2ae739d7a9f1453028786c9e2359",
    "aliases": {}
  },
  "pl-97afe74a01cbd40cb645f75c97a0c40a": {
    "cover": "/production-library/editorial-covers/pl-97afe74a01cbd40cb645f75c97a0c40a.webp",
    "sourceTemplateId": "pl-97afe74a01cbd40cb645f75c97a0c40a",
    "aliases": {}
  },
  "pl-67ffc2cc722368e4bf8e0abd29d82611": {
    "cover": "/production-library/editorial-covers/pl-67ffc2cc722368e4bf8e0abd29d82611.webp",
    "sourceTemplateId": "pl-67ffc2cc722368e4bf8e0abd29d82611",
    "aliases": {}
  },
  "pl-c3e9f75dd3cb6716f2fe8ec92b2589ff": {
    "cover": "/production-library/editorial-covers/pl-c3e9f75dd3cb6716f2fe8ec92b2589ff.webp",
    "sourceTemplateId": "pl-c3e9f75dd3cb6716f2fe8ec92b2589ff",
    "aliases": {}
  },
  "pl-f793183ee3fb440b25933e38a3be8054": {
    "cover": "/production-library/editorial-covers/pl-f793183ee3fb440b25933e38a3be8054.webp",
    "sourceTemplateId": "pl-f793183ee3fb440b25933e38a3be8054",
    "aliases": {}
  },
  "pl-054d6f303ccb1d2d1d4b77c4e2fe493b": {
    "cover": "/production-library/editorial-covers/pl-054d6f303ccb1d2d1d4b77c4e2fe493b.webp",
    "sourceTemplateId": "pl-054d6f303ccb1d2d1d4b77c4e2fe493b",
    "aliases": {}
  },
  "pl-dc6bf8344777338ca2e4ac105bf01721": {
    "cover": "/production-library/editorial-covers/pl-dc6bf8344777338ca2e4ac105bf01721.webp",
    "sourceTemplateId": "pl-dc6bf8344777338ca2e4ac105bf01721",
    "aliases": {}
  },
  "pl-aa89e194b5e4b8bcfde47e942eda498c": {
    "cover": "/production-library/editorial-covers/pl-aa89e194b5e4b8bcfde47e942eda498c.webp",
    "sourceTemplateId": "pl-aa89e194b5e4b8bcfde47e942eda498c",
    "aliases": {}
  },
  "pl-21560fe51a17367ad63198435a0b2de2": {
    "cover": "/production-library/editorial-covers/pl-21560fe51a17367ad63198435a0b2de2.webp",
    "sourceTemplateId": "pl-21560fe51a17367ad63198435a0b2de2",
    "aliases": {}
  },
  "pl-afe18b609c73dc7a3fd84f5738cf24e6": {
    "cover": "/production-library/editorial-covers/pl-afe18b609c73dc7a3fd84f5738cf24e6.webp",
    "sourceTemplateId": "pl-afe18b609c73dc7a3fd84f5738cf24e6",
    "aliases": {}
  },
  "pl-1c2d24e4294a6dadfabf4dee41dc6898": {
    "cover": "/production-library/editorial-covers/pl-1c2d24e4294a6dadfabf4dee41dc6898.webp",
    "sourceTemplateId": "pl-1c2d24e4294a6dadfabf4dee41dc6898",
    "aliases": {}
  },
  "pl-6d86edeb8aedca5b9a4b979486babf41": {
    "cover": "/production-library/editorial-covers/pl-6d86edeb8aedca5b9a4b979486babf41.webp",
    "sourceTemplateId": "pl-6d86edeb8aedca5b9a4b979486babf41",
    "aliases": {}
  },
  "pl-886f181cb6b7fc430d205251c8b9f481": {
    "cover": "/production-library/editorial-covers/pl-886f181cb6b7fc430d205251c8b9f481.webp",
    "sourceTemplateId": "pl-886f181cb6b7fc430d205251c8b9f481",
    "aliases": {}
  },
  "pl-509b55802ac4982be8b3849348b6571a": {
    "cover": "/production-library/editorial-covers/pl-509b55802ac4982be8b3849348b6571a.webp",
    "sourceTemplateId": "pl-509b55802ac4982be8b3849348b6571a",
    "aliases": {}
  }
};

// The captured case feed does not include reusable project snapshots.
