rm -f SQRT.OT;
fpc csiracem.pas && 
    ./csiracem SQRT.CVT SQRT.DAT

echo "output:"
cat SQRT.OT
echo

