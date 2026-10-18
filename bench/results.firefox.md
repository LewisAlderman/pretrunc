# pretrunc against the prior art: firefox

Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 26.0 | 1.0 | 0 |
| pretext demo `clampLines` | 52.0 | 1.0 | 0 |
| pretext-truncate `findTruncationPoint` | 55.0 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 73.0 | 3.0 | 0 |
| pretext demo `layoutMiddle` | 166.0 | 8.0 | 6 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 20.0 | 1.0 | 0 |
| pretext demo `clampLines` | 17.0 | 1.0 | 0 |
| pretext-truncate `findTruncationPoint` | 24.0 | n/a | 109 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 40.0 | 19.0 | 0 |
| pretrunc `clamp`, middle | 36.0 | 13.0 | 0 |
