# Public Primavera P6 samples

These are unmodified public XER examples from
[JaiLaff/XER-Splitter](https://github.com/JaiLaff/XER-Splitter), pinned to commit
`58a1000ed503576de967c578f10ac09807444c05`.

| File                         |      Bytes | Activities |
| ---------------------------- | ---------: | ---------: |
| [airport.xer](./airport.xer) |     71,429 |         66 |
| [rehab-2.xer](./rehab-2.xer) | 18,592,333 |      6,977 |

## Sources

- [airport.xer original download](https://raw.githubusercontent.com/JaiLaff/XER-Splitter/58a1000ed503576de967c578f10ac09807444c05/tests/Example-XERs/airport.xer)
- [rehab-2.xer original download](https://raw.githubusercontent.com/JaiLaff/XER-Splitter/58a1000ed503576de967c578f10ac09807444c05/tests/Example-XERs/rehab-2.xer)
- [Source repository license](https://github.com/JaiLaff/XER-Splitter/blob/58a1000ed503576de967c578f10ac09807444c05/LICENSE)

## Reading and validation

Both files retain their original Windows-1252 encoding. In the browser, read
their bytes using `arrayBuffer()` and decode with `TextDecoder("windows-1252")`.

Readable files can still contain schedule warnings. These originals are not
guaranteed to pass the three schedule checks. Any deliberately modified error
fixtures should be stored separately and labeled with their changes.

## SHA-256 checksums

```text
a2f3b2469e26f19985ac801786c90edfb965a7bc194a6e57704aa845c5f8611f  airport.xer
2c1dce175b9f078111a48dc13fd1777f5fbd4cd7ab6623e647e7437330c60b7f  rehab-2.xer
```
