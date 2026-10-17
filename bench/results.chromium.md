# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 17.2 | 0.7 | 0 |
| pretext demo `clampLines` | 15.8 | 0.8 | 0 |
| pretext-truncate `findTruncationPoint` | 16.9 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 19.2 | 1.8 | 0 |
| pretext demo `layoutMiddle` | 63.3 | 4.5 | 1 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 9.6 | 0.4 | 0 |
| pretext demo `clampLines` | 6.2 | 0.3 | 0 |
| pretext-truncate `findTruncationPoint` | 8.5 | n/a | 18 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 19.0 | 10.9 | 0 |
| pretrunc `clamp`, middle | 18.6 | 7.6 | 0 |
