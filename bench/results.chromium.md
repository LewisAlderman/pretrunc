# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 26.2 | 0.7 | 0 |
| pretext demo `clampLines` | 26.1 | 0.9 | 0 |
| pretext-truncate `findTruncationPoint` | 27.5 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 57.7 | 1.8 | 0 |
| pretext demo `layoutMiddle` | 115.5 | 4.5 | 0 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 14.2 | 0.4 | 0 |
| pretext demo `clampLines` | 7.9 | 0.3 | 0 |
| pretext-truncate `findTruncationPoint` | 10.1 | n/a | 107 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 20.5 | 10.5 | 0 |
| pretrunc `clamp`, middle | 21.6 | 7.4 | 0 |
