# pretrunc against the prior art: firefox

Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 15.0 | 1.0 | 0 |
| pretext demo `clampLines` | 34.0 | 1.0 | 0 |
| pretext-truncate `findTruncationPoint` | 37.0 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 67.0 | 3.0 | 0 |
| pretext demo `layoutMiddle` | 101.0 | 10.0 | 11 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 17.0 | 1.0 | 0 |
| pretext demo `clampLines` | 13.0 | 0.0 | 0 |
| pretext-truncate `findTruncationPoint` | 19.0 | n/a | 19 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 35.0 | 20.0 | 0 |
| pretrunc `clamp`, middle | 38.0 | 14.0 | 0 |
