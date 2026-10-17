# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 18.4 | 0.7 | 0 |
| pretext demo `clampLines` | 15.2 | 0.8 | 0 |
| pretext-truncate `findTruncationPoint` | 18.1 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 16.7 | 1.7 | 0 |
| pretext demo `layoutMiddle` | 61.4 | 4.6 | 1 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 8.5 | 0.4 | 0 |
| pretext demo `clampLines` | 6.3 | 0.3 | 0 |
| pretext-truncate `findTruncationPoint` | 7.7 | n/a | 18 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 17.4 | 10.9 | 0 |
| pretrunc `clamp`, middle | 17.8 | 6.6 | 0 |
