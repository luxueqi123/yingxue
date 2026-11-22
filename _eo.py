import io, os, sys

def info(p):
    b = io.open(p, "rb").read()
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n") - crlf
    return crlf, lf

for p in sys.argv[1:]:
    c, l = info(p)
    print("%-60s crlf=%d bare_lf=%d" % (p, c, l))
