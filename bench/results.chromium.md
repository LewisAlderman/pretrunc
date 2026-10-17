# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 19.0 | 1.0 | 0 |
| pretext demo `clampLines` | 20.1 | 0.9 | 0 |
| pretext-truncate `findTruncationPoint` | 20.1 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 26.2 | 2.4 | 0 |
| pretext demo `layoutMiddle` | 71.6 | 5.1 | 1 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 10.9 | 0.7 | 0 |
| pretext demo `clampLines` | 6.7 | 0.4 | 0 |
| pretext-truncate `findTruncationPoint` | 9.4 | n/a | 18 |
