# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 16.3 | 0.7 | 0 |
| pretext demo `clampLines` | 15.3 | 0.8 | 0 |
| pretext-truncate `findTruncationPoint` | 17.6 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 19.1 | 1.9 | 0 |
| pretext demo `layoutMiddle` | 64.5 | 3.8 | 1 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 9.2 | 0.5 | 0 |
| pretext demo `clampLines` | 5.7 | 0.3 | 0 |
| pretext-truncate `findTruncationPoint` | 7.8 | n/a | 18 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 18.2 | 10.2 | 0 |
| pretrunc `clamp`, middle | 18.5 | 7.8 | 0 |
