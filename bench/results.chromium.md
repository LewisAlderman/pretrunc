# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 16.5 | 0.7 | 0 |
| pretext demo `clampLines` | 14.9 | 0.8 | 0 |
| pretext-truncate `findTruncationPoint` | 17.4 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 18.9 | 1.7 | 0 |
| pretext demo `layoutMiddle` | 65.2 | 3.9 | 1 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 9.0 | 0.5 | 0 |
| pretext demo `clampLines` | 5.5 | 0.3 | 0 |
| pretext-truncate `findTruncationPoint` | 8.2 | n/a | 18 |
