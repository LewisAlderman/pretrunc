# pretrunc against the prior art: firefox

Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0

### 5,000 names, end of one line, 120 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut` | 27.0 | 1.0 | 0 |
| pretext demo `clampLines` | 50.0 | 1.0 | 0 |
| pretext-truncate `findTruncationPoint` | 59.0 | n/a | 16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `cut`, middle | 78.0 | 3.0 | 0 |
| pretext demo `layoutMiddle` | 165.0 | 10.0 | 6 |

### 500 paragraphs, end of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp` | 21.0 | 1.0 | 0 |
| pretext demo `clampLines` | 18.0 | 1.0 | 0 |
| pretext-truncate `findTruncationPoint` | 25.0 | n/a | 109 |

### 500 paragraphs, start or middle of 3 lines, 260 px

| | cold ms | warm ms | overflows |
| --- | ---: | ---: | ---: |
| pretrunc `clamp`, start | 42.0 | 20.0 | 0 |
| pretrunc `clamp`, middle | 40.0 | 14.0 | 0 |
