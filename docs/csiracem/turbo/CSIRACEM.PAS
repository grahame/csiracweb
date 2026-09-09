{$A+,B-,D+,E+,F-,G-,I+,L+,N+,O+,R+,S+,V+,X+}
{$M 16384,0,655360}
Program CSIRACEM;
{Emulates the CSIRAC command set
 Program read in  hi loXY format where hi and lo are scale32 nos.
 Written in TurboPascal version 6 by J.W. Spencer, June 1997 - Aug 2000
 24.9.98 Changed code for S=0 so that current instruction is not executed
         when S cleared.
 25.9.98 Changed I source code so that value in I register is source,
         then tape is read - instead of vice versa
 6.12.98 Incremented S before command execution instead of after
 14.12.98 Implemented trigger stop to occur after command execution
          as described in the programming manuals.
 15.5.99  MA display added. OT output displayed to improve usage for games.
 16.5.99  Corrected code for TA source 
 30.5.99  Corrected implementation of K-reg as 20 bit register
 21.6.99  Corrected RowtoI procedure: p20,p19 should be ORed, not added
 27.6.99  Modified function Input5 to insert case shifts as necessary,
          and use b to indicate blank tape, f for FS, l for LS, s for stop.
 30.6.99  Used 4-line window to display Teleprinter output.
  2.7.99  Display reader status in window on display screen and allow
          toggling reader type without having to go to options menu.
  8.8.99  Emulated NA&S to K in ReadPrimary procedure. 
 10.9.99  Added facility to set I register switches.
          Used Turbo's delay after correcting TURBO.TPL
 5.11.99  Allowed for zero output to destination 3 (OP)
14.11.99  Added ability to TSP from drum. 
12.12.99  Added features to make program more Windows-friendly:
           Assigned 4K I/O buffer to text files via SetTextBuf
           Checked KeyPressed only every 500 CSIRAC instructions
           Added option to blank screen during program execution.
17.5.00   Modified Input5 to use t to indicate TAB character.
           Corrected MAHOLD so that CSIRAC->longint conversion is done
           when writing and Longint->CSIRAC conversion is done when
           reading.
           Implemented NA&S to K switch operation as option.
19.5.00   Allowed for 5-hole program.
21.5.00  Corrected turnover of S from 23,31 to 24,0
 1.7.00  Added code to allow output of 5H program from Imterprogram.
19.7.00  Changed so that OT and OP files take the name of the data
         file if it exists, else the program file.
         Added check for presence of Part 7 Interprogram in order to
         use correct output routine.
         Added stop when first 29 read when reading in 5H program.
22.7.00  Clear MA array if MAHOLD does not exist.
 3.8.00  Changed control characters in Option menu
         Implemented shortcut menu.
         Delete OT file when Interprogram used.
12.4.01  Initialize NB to 0 0 0 0
3.12.01  Transfer display of S,K registers to before detection of keypressed
         Display A after CA source
         In Input5 subroutine, insert exit after firsti := false
         In initialize subroutine, multiply halt selector address by p11
         Use pos routine to better detect when Interprogram used }
Uses crt,dos;
const {source mnemonics}
      sourcem: array[0..31] of string[2] = (' M',' I','NA','NB',' A','SA',
              'HA','TA','LA','CA','ZA',' B',' R','RB',' C','SC','RC',' D',
              'SD','RD',' Z','HL','HU',' S','PE','PL',' K','MA','MB','MC',
              'MD','PS');
      {destination mnemonics}
      destinationm: array[0..31] of string[2] = (' M',' Q','OT','OP',' A',
                   'PA','SA','CA','DA','NA',' P',' B','XB',' L',' C','PC',
                   'SC',' D','PD','SD',' Z','HL','HU',' S','PS','CS','PK',
                   'MA','MB','MC','MD',' T');
      {Teleprinter - Letter shift}
      TL : array[0..26] of char = ('A','B','C','D','E','F','G','H','I',
           'J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X',
           'Y','Z',' ');
      {Teleprinter - Figure shift}
      TF : array[0..26] of char = ('0','1','2','3','4','5','6','7','8',
           '9','+','-','.',')','(','i','j','k','í','è',' ','é','ê','â',
           'ã','ä',' ');
      {Flexowriter - Letter shift}
      FL : array[0..26] of char = (#0,'Q','W','C','R','K','L','U','I',
           'D','V','A','F','M','G','N','P','J','H','E','B','T','Y','S',
           'X','O','Z');
      {Flexowriter - Figure shift}
      FF : array[0..26] of char = (#0,'1','2','*','4','(',')','7','8',
           '#','=','-','&','.',#9,',','0','s','œ','3','''','5','6','/',
           'x','9','+');
      p20: longint = 524288;
      p19: longint = 262144;
      p11: longint = 1024;
      p1 : longint = 1;
type scale32 = 0..31;
     st2 = string[2];
     st7 = string[7];
var Pfile,FoutT,FoutF,Dfile,Hold,Store: text;
    cstring: string[80];
    cmd,source,n: longint;
    adhi,adlo,j,cout,high,low: scale32;
    src,des,dad: scale32;
    ch,st: char;
    code,tries,LineNo: integer;
    M: array[0..1023] of longint;    {Memory}
    MA: array[0..1023] of longint;   {Drum}
    Address,ShiftAddress: longint;
    A,B,C,H,I,NA,NB,K,S: longint;    {registers}
    IS: longint;                     {I register switches}
    D: array[0..15] of longint;      {registers}
    MAA: longint;                    {MA address}
    PlusK,first,error,ReadData,NA2K,NAS2K,VideoOff: boolean;
    ProgramFname,DataFname,Tfname,Ffname: string;
    fst,fsf,carry,Sclear,StopFlag,OTused,FirstStop: boolean;
    pd: byte;
    nc,nline,OTcount: integer;
    buf16: array[0..15] of Longint;  {to hold last 16 commands executed}
    DrumWrite,OneShot,TriggerStop,DisplayD,PrimaryStored: boolean;
    TriggerAddress,Mstart,StartAddress,FinishAddress: Longint;
    bin,{firsti,}pexist,dexist,read5,punch5,screen,Clearmem: boolean;
    TSPFname,Fname: string;
    PC: array[0..25] of longint;     {Primary & Control data}
    OTBuffer: array[1..700] of char;
    DLINE: STRING;
    bufi,bufo: array[1..4096] of char;
    Output5hprog,Bootstrap,FirstOP: boolean;
    s32: array[1..4] of scale32;

procedure Execute; forward;
Procedure Continue; forward;

Function Exist(FileName: String): boolean;
var Fil: file;
begin
  {$I-} Assign(Fil,FileName);
        Reset(Fil);
        Close(Fil);
  {$I+}      
  Exist := (IOResult = 0) and (FileName<>'');
end;

function FSIZE2FN (FileName : string) : longint;  {from Timo's FAQ}
var FileInfo : SearchRec;   { SearchRec is declared in the Dos unit }
begin
  fsize2fn := -1;           { return -1 if anything goes wrong }
  FindFirst (filename, AnyFile, FileInfo);
  if DosError <> 0 then exit;
  if (FileInfo.Attr and VolumeId = 0) and
     (FileInfo.Attr and Directory = 0) then
       fsize2fn := FileInfo.Size;
end;  (* fsize2fn *)

procedure NewValI(var St: st2; var Valuei : integer;
                    var code : Integer);
    {NewVal replaces Turbo's val procedure.}
  const UnwantedCharacters : set of Char = [' ', '$', ','];
  var InputString : string[80] absolute St;
    WorkString : string[80];
    Position : Integer;
  begin
    WorkString := InputString;
    Position := 1;
    while Position <= Length(WorkString) do
      if WorkString[Position] in UnwantedCharacters then
        Delete(WorkString, Position, 1)
      else
        Position := Position+1;
    if (Length(WorkString) > 0) and (WorkString[1] = '+') then
      Delete(WorkString, 1, 1);
    if Length(WorkString) = 0 then
      begin
        Valuei := 0;
        code := 0;
      end
    else
      begin
        Val(WorkString, Valuei, code);
        if Length(WorkString) <> Length(InputString) then
          code := -code;
      end;
  end;

  (* Number of substrings in a string *)
  function PARSENFN (sj : string) : integer;
  var i, n, p : integer;
  begin
    p := Length(sj);
    n := 0;
    i := 1;
    repeat
      while (sj[i] <= #32) and (i <= p) do Inc(i);
      if i > p then begin parsenfn := n; exit; end;
      while (sj[i] > #32) and (i <= p) do Inc(i);
      Inc(n);
      if i > p then begin parsenfn := n; exit; end;
    until false;
  end;  (* parsenfn *)
  {}
  (* Get substrings from a string *)
  function PARSERFN (sj : string; PartNumber : integer) : string;
  var i, j, n, p : integer;
      stash      : string;
  begin
    if (PartNumber < 1) or (PartNumber > PARSENFN(sj)) then
      begin PARSERFN := ''; exit; end;
    p := Length(sj);
    n := 0;
    i := 1;
    repeat
      while (sj[i] <= #32) and (i <= p) do Inc(i);
      Inc(n);
      if n = PartNumber then
        begin
          j := 0;
          while (sj[i] > #32) and (i <= p) do
            begin
              Inc(j);
              stash[0] := chr(j);
              stash[j] := UpCase(sj[i]);
              Inc(i);
            end;
          PARSERFN := stash;
          exit;
        end
       else
         while (sj[i] > #32) and (i <= p) do Inc(i);
    until false;
  end;  (* parserfn *)
 
procedure P(w:longint);
{print a CSIRAC word in -1<=w<1 as decimal}
begin
  if (w and p20) <> 0 then write(-1.0+(w and $7FFFF)/p20:2:6)
                      else write(w/p20:2:6);
end;

procedure PI(w:longint);
{print a CSIRAC word in -524288<=w<524288 as integer}
begin
  if (w and p20) <> 0 then write(-p20+(w and $7FFFF):8)
                      else write(w:8);
end;

procedure writebin(w: longint; n: integer );
{write binary representation of a CSIRAC word in groups of 5 bits if
 bin is true, else write in group of 20 bits}
var j: integer;
    bits: array[1..20] of {byte} char;
begin
  for j := 1 to n do
   if bin then
   begin
   if (w and (Longint(1) shl (j-1))) > 0 then
      bits[j] := '1' else bits[j] := '0';
   end else
   begin
     if (w and (Longint(1) shl (j-1))) > 0 then
        bits[j] := #254 else bits[j] := #32;
   end;
  for j := 1 to n do begin
                        write(bits[n+1-j]:1);
                        if (j mod 5) = 0 then
                        begin
                          if bin then write(' ');
                        end;
                      end;
end;

procedure writebinABC(w: longint; n: integer );
{write binary representation of a CSIRAC word in groups of 5 bits if
 bin is true, else write in group of 20 bits}
var j: integer;
    bits: array[1..20] of {byte} char;
begin
  for j := 1 to n do
  if bin then
  begin
    if (w and (Longint(1) shl (j-1))) > 0 then
       bits[j] := '1' else bits[j] := '0';
  end else
  begin
    if (w and (Longint(1) shl (j-1))) > 0 then
       bits[j] := #30 else bits[j] := #95;
  end;
  for j := 1 to n do begin
                        write(bits[n+1-j]:1);
                        if (j mod 5) = 0 then
                        begin
                          if bin then write(' ');
                        end;
                      end;
end;

Function CtoL(w: longint): Longint;
{convert CSIRAC word held in a Longint to equivalent Longint representation}
begin
  if (w and p20) > 0 then CtoL := w or $FFF00000   {negative no.,extend sign}
                     else CtoL := w;               {positive number, OK}
end;

Function LtoC(w: longint): Longint;
{convert Longint to CSIRAC 20-bit word}
begin
  LtoC := w and $000FFFFF;
end;

function C32toI(adhi,adlo: scale32): longint;
{convert scale32 address to a longint in p1 units}
begin
  C32toI := 32*adhi + adlo;
end;

procedure ItoC32(I: longint; var adhi,adlo: scale32);
{convert a longint to a scale32 address in p1 units}
begin

  adhi := I div 32;
  adlo := I - 32*adhi;
end;

Procedure RowToI(row: st7; var total: longint; var error: boolean);
{convert tape row in hi loXY format to a longint}
var hi,lo: integer;
    hi32,lo32: scale32;
    shi,slo: st2;
begin
  error := false;
  total := 0;
  shi := Copy(row,1,2);
  NewValI(shi,hi,code);
  error := code <> 0;
  if (hi >= 0) and (hi < 32) then hi32 := hi else error := true;
  slo := Copy(row,4,2);
  NewValI(slo,lo,code);
  if code <> 0 then error := true;
  if (lo >= 0) and (lo < 32) then lo32 := lo else error := true;
  total := C32toI(hi32,lo32);
  if row[6] = 'X' then total := total or p19;
  if row[7] = 'Y' then total := total or p20;
end;

procedure Cleanup;
{Close open files, erase zero length files and preserve drum contents.
 Files FoutT and FoutF must exist and be closed}
begin
{$I-}
  Close(Pfile);
  if dexist then Close(Dfile);
{$I+}
  {delete zero length output files}
  if FSIZE2FN(Tfname) = 0 then Erase(FoutT);
  if FSIZE2FN(Ffname) = 0 then Erase(FoutF);
  for n := 1 to Length(ProgramFname) do
   ProgramFname[n] := Upcase(ProgramFname[n]);
  if (pos('T754.CVT',ProgramFname) <> 0) or (pos('T755.CVT',ProgramFname) <>0)
  then  Erase(FoutT);   {do not save OT file when Interprogram used}
  {preserve drum contents in file MAHOLD if drum has been used}
  if DrumWrite then
  begin
    Assign(Hold,'MAHOLD'); Rewrite(Hold);
    for n := 0 to 1023 do writeln(Hold,CtoL(MA[n]));
    Flush(Hold); Close(Hold);
  end;
  window(1,1,80,25);
  ClrScr;
  Halt;
end;

Procedure ReadPrimary;
{read in and store primary in memory, exit on blank tape.
 assumes that NA = m n 1 0, emulates NA&S to K on.
 For non-stop primary, NA must be set to 2 0 1 0 before reading Primary. }
var row: st7;
    idec: longint;
    j: integer;
begin
  {Omit initial blanks and any leadin diagonal}
  repeat
    row := '       '; {make sure that row[6] and row[7] are blank}
    readln(Pfile,row);
    LineNo := LineNo+1;
    RowToI(row,idec,error);
    if error then
    begin
      GotoXY(1,25); writeln('Error on line ',LineNo);
      Cleanup;
    end;
    j := idec; {longint is not valid as case selector; assign to integer}
    case j of
    0,1,2,4,8,16,32,64,128,256,512: ;      {ignore}
    else begin M[(S or NA) shr 10] := Idec; S := S + p11; end;
    end; {case}
  until S = p11;
  {finish when blank tape found}
  repeat
    if not eof(Pfile) then
    begin
      row := '       '; {make sure that row[6] and row[7] are blank}
      readln(Pfile,row);
      LineNo := LineNo+1;
      RowToI(row,idec,error);
      if error then
      begin
        GotoXY(1,25); writeln('Error on line ',LineNo);
        Cleanup;
      end;
      if idec <> 0 then
      begin
        M[(S or NA) shr 10] := Idec;
        S := S + p11;
      end;
    end;
  until idec = 0;
  PrimaryStored := true;
  screen := false;
end;


procedure display;
var n: integer;
    s1,s2: scale32;
begin
  Clrscr;
  window(56,6,80,18);
  gotoXY(1,1);
  write('R. READER: ');
  if read5 then write('5 HOLE ') else write('12 HOLE');
  gotoXY(1,2);
  write('U. Use ');
  if ReadData then write('data file   ') else write('program file');
  ClrEol;
  gotoXY(1,3);
  write('K. NA&S to K: ');
  if NAS2K then write('ON ') else write('OFF');
  gotoXY(1,4);
  write('N. NA to K: ');
  if NA2K then write('ON ') else write('OFF');
  gotoXY(1,5);
  write('Z. Punch: ');
  if punch5 then write('5 HOLE ') else write('12 HOLE');
  gotoXY(1,6);
  write('A. Set NA Reg.(P6 units)','':4);
  gotoXY(1,7);
  write('B. Set NB Reg.(PL units)','':4);
  gotoXY(1,8);
  write('I. Set  I Reg.(P6 units)');
  gotoXY(1,9);
  write('S. Clear S','':8);
  gotoXY(1,10);
  write('1. One Shot: ');
  if OneShot then write('ON ') else write('OFF');
  gotoXY(1,11);
  write('H. Trigger Stop: ');
  if TriggerStop then write('ON ') else write('OFF');
  gotoXY(1,13); write('X. Exit');
  window(1,1,80,25);
  gotoXY(2,1); write('A '); writebinABC(A,20);
  gotoXY(29,1); write('B '); writebinABC(B,20);
  gotoXY(77,1); write('*  *');
  gotoXY(2,2); write('C '); writebinABC(C,20);
  gotoXY(60,2); write('K '); writebin(K shr 10,10);
  if (src in [0..31]) and (des in [0..31]) then
  begin
    gotoXY(76,2); write(sourcem[src],' ', destinationm[des]);
  end;
  gotoXY(2,3); write('S '); writebin(S,20);
  gotoXY(28,3); write('MA '); writebin(MAA,20);
  gotoXY(29,2); write('H '); writebin(H,10);
  gotoXY(47,2); write('O '); writebin(Longint(cout),5);
  gotoXY(2,4);  write('I '); writebin(I or IS,20);
  ItoC32(NA shr 10,s32[1],s32[2]); ItoC32(NA and $3FF,s32[3],s32[4]);
  gotoXY(28,4);
  write('NA',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
  ItoC32(NB shr 10,s32[1],s32[2]); ItoC32(NB and $3FF,s32[3],s32[4]);
  gotoXY(44,4);
  write('NB',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
  if displayD then
  begin {display D registers}
    for n := 0 to 15 do
    begin
      gotoXY(1,6+n); write(n:2);
      gotoXY(4,6+n); 
      writebin(D[n],20);
    end;
    gotoXY(14,5);
    write('D');
    end else
  begin {display last 16 commands executed}
    for n := 0 to 15 do
    begin
      gotoXY(4,6+n);
      writebin(Buf16[n],20);
    end;
    gotoXY(3,5);
    write('Last 16 commands executed');
  end;
  ItoC32(Mstart,s1,s2);
  for n := 0 to 15 do
  begin
    gotoXY(31,6+n);
    writebin(M[Mstart+n],20);
  end;
    gotoXY(36,5);
    write('M (',s1,',',s2,') onwards');
    write('':5,'Shortcut Menu');
  if OTused then
  begin
    window(1,22,80,25); for n := 1 to OTcount-1 do write(OTBuffer[n]);
    OTcount := 1;
    window(1,1,80,25);
  end else
  begin
    gotoXY(1,22); ClrEol;
    gotoXY(1,23); ClrEol;
    gotoXY(1,24); ClrEol;
  end;
  if (StopFlag or OneShot) and (des <> 31) and (not OTused) then
  begin
    gotoXY(1,23);
    write('Fraction  A '); P(A); write('  B '); P(B); write('  C '); P(C);
    write('  D0 '); P(D[0]); write('  D1 '); P(D[1]); writeln;
    write('Integer   A '); PI(A); write('  B '); PI(B); write('  C '); PI(C);
    write('  D0 '); PI(D[0]); write('  D1 '); PI(D[1]);
  end;
  screen := true;
end;

procedure TSP(start,finish: longint; TSPFname: string);
{produce a TSP of emulated memory in designated range}
var n: longint;
    cmd: longint;
    adhi,adlo,s,d,ahi,alo: scale32;
    F: text;
begin
  Assign(F,TSPFname); Rewrite(F);
  for n := start to finish do
  begin
    if st = 'M' then cmd := LtoC(M[n]) else cmd := LtoC(MA[n]);
    adhi := (cmd and $000F8000) shr 15;
    adlo := (cmd and $00007C00) shr 10;
    s    := (cmd and $000003E0) shr 5;
    d    := cmd and $0000001F;
    ItoC32(n,ahi,alo);
    if (adhi=0) and (adlo=0) then
    writeln(F,ahi:2,alo:3,'':6,'':3,sourcem[s]:3,destinationm[d]:3)
    else if (adhi=0) then
    writeln(F,ahi:2,alo:3,'':6,adlo:3,sourcem[s]:3,destinationm[d]:3)
    else
    writeln(F,ahi:2,alo:3,adhi:6,adlo:3,sourcem[s]:3,destinationm[d]:3);
  end;
  Flush(F); Close(F);
end;


procedure Initialize;
var j,n: integer;
begin
  ReadData := false;
  TriggerStop := false;
  TriggerAddress := 767*p11;  {23 31}
  OneShot := false;
  Mstart := 0;
  {clear all registers}
  A := 0; B := 0; C := 0; H := 0; I := 0; K := 0; NA := 32; NB := 0;
  MAA := 0; IS := 0;
  for j := 0 to 15 do D[j] := 0;
  {clear memory}
  if Clearmem then for n := 0 to 1023 do M[n] := 0;
  S := 0;
end;

Procedure TellInitialSettings;
begin
  ClrScr;
  writeln('The initial Control Desk Switch Panel settings are:');
  writeln;
  writeln('Unit add to S per command: ON');
  writeln('Reader Switch: ON   Reader Selector: 12 HOLE');
  writeln('Halt Selector: OFF  Speed Selector: HIGH');
  writeln('Punch: ON   Printer: ON   Punch Selector: 5 HOLE');
  writeln('Main store display selector: 0  0',
           ' (to display primary usually)');
  if displayD then writeln('Display: CONTENT OF ALL D REGISTERS')
              else writeln('Display: LAST 16 COMMANDS EXECUTED');
  writeln('Halt Selector: OFF');
  writeln('Halt Selector address: 23  31');
  writeln('NA register: 0 0 1 0  NB register: 0 0 0 0  I register: 0 0 0 0');
  writeln('Clearance Buttons: (All Reg,A,B,C,All D,H,S,I,Out,',
           'Tape Reader): OFF');
  writeln('One Shot: OFF');
  writeln('NA & S to K: OFF   NA to K: OFF');
  writeln('Drum Writing Control: ON');
  writeln('Start/Stop: START  Start: ON');
  writeln;
  if Clearmem then
  writeln('Machine starts with (S)=0, All Registers, Main Store clear')
  else begin
         writeln('Machine starts with (S)=0, All Registers clear');
         writeln('Main store not cleared if MAHOLD file exists');
       end;
  writeln('Auxiliary (drum) store not cleared');
  writeln;
  if VideoOff then writeln('Video display off during program execution') else
  writeln('Video display on during program execution');
  writeln;
  Continue;
  ClrScr;
end;

procedure DecodeSource(so: st2; var s32: scale32; var code: integer);
var n: scale32;
    si: integer;
    SourceFound: boolean;
begin
  Code := 0;
  SourceFound := false;
  for n := 0 to 31 do
  begin
    if so = sourcem[n] then begin SourceFound := true;  s32 := n; end;
  end;
  {allow for numeric constants}
  if not SourceFound then
  begin
    NewValI(so,si,code);
    if (si >= 0) and (si < 32) then s32 := si else code := 1;
  end;
end;

procedure DecodeDestination(de:st2; var d32: scale32; var code: integer);
var n: scale32;
    si: integer;
    DestinationFound: boolean;
begin
  Code := 0;
  DestinationFound := false;
  for n := 0 to 31 do
  begin
    if de = destinationm[n] then begin
                                 DestinationFound := true;  d32 := n;
                                end;
  end;
  {allow for numeric constants}
  if not DestinationFound then
  begin
    NewValI(de,si,code);
    if (si >= 0) and (si < 32) then d32 := si else code := 1;
  end;
end;

procedure Console;
var s32: array[1..4] of scale32;
    option: char;
    n,ns,si: integer;
    ss: string;
    sn: array[1..4] of string;
    code: array[1..4] of integer;
    Maddr,cmd: longint;
    p: byte;
    adhi,adlo,so,de: scale32;
    OK: boolean;
begin
 repeat
  ClrScr;
  write('Current settings: ');
  write('Reader: ');
  if read5 then write('5 HOLE ') else write('12 HOLE');
  write('  Punch: ');
  if punch5 then write('5 HOLE ') else write('12 HOLE');
  write('  NA to K: ');
  if NA2K then write('ON ') else write('OFF');
  write('  NA&S to K: ');
  if NAS2K then writeln('ON') else writeln('OFF');
  ItoC32(NA shr 10,s32[1],s32[2]); ItoC32(NA and $3FF,s32[3],s32[4]);
  write('NA register:',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
  ItoC32(NB shr 10,s32[1],s32[2]); ItoC32(NB and $3FF,s32[3],s32[4]);
  write('    NB register:',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
  ItoC32( IS shr 10,s32[1],s32[2]); ItoC32( IS and $3FF,s32[3],s32[4]);
  writeln('    I register:',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
  write('One-Shot switch: ');
  if OneShot then write('ON ') else write('OFF');
  write('   Halt Selector: ');
  if TriggerStop then write('ON ') else write('OFF');
  ItoC32(TriggerAddress shr 10,s32[1],s32[2]);
  writeln('    Halt Selector address:',s32[1]:3,s32[2]:3);
  ItoC32(Mstart,s32[1],s32[2]);
  write('Video ');
  if VideoOff then write('OFF') else write('ON ');
  write('   Memory Display Address:',s32[1]:3,s32[2]:3);
  if displayD then writeln('    Display D registers ')
            else writeln('    Display last 16 commands executed ');
{  if VideoOff then writeln('Video OFF during program execution') else
                   writeln('Video ON during program execution'); }
  writeln('Press R to toggle reader between 12 hole (default) and 5 hole');
  writeln('      U to Use data file instead of program file');
  writeln('      P to read in another 12-hole Program');
  writeln('      K to toggle NA&S to K switch (default OFF)');
  writeln('      N to toggle NA to K switch (default OFF)');
  write('      L to Load a T001 Primary and Control stored in memory into ');
  writeln('0 0 to 0 24');
  writeln('      Z to toggle punch between 5 hole (default) and 12 hole');
  writeln('      E to Edit memory');
  writeln('      M to set Memory display address (default 0 0)');
  writeln('      T to TSP a section of memory or drum');
  write('      A to set NA register, B to set NB register, ');
  writeln('I to set I register');
  writeln('      S to clear Sequence register');
  writeln('      H to toggle Halt Selector (Trigger Stop) and set address');
  writeln('      Q for Quick look at register and memory display then return here');
  writeln('      1 to toggle OneShot switch (default OFF)');
  write('      C to toggle display between 0s and 1s (default)');
  writeln(' and "more like CSIRAC"');
  write('      D to toggle display between D registers and ');
  writeln('last 16 commands executed');
  writeln('      V to disable video during program execution');
  writeln('      X to eXit (return to Operating System)');
  writeln('or RETURN to accept above settings  ');
  option := readkey;  option := UpCase(option);
  case option of
  'R': read5 := not(read5);    {toggle reader}
  'Z': punch5 := not(punch5);  {toggle punch}
  'I': begin {set I register}
         repeat
           write('Enter 4 scale32 numbers separated by spaces ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 4 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=4) and (code[1]=0) and (code[2]=0)
                       and (code[3]=0) and (code[4]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         IS := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
       end;
  'A': begin {set NA register}
         repeat
           write('Enter 4 scale32 numbers separated by spaces ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 4 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=4) and (code[1]=0) and (code[2]=0)
                       and (code[3]=0) and (code[4]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         NA := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
       end;
  'B': begin {set NB register}
         repeat
           write('Enter four scale32 numbers separated by spaces ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 4 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=4) and (code[1]=0) and (code[2]=0)
                       and (code[3]=0) and (code[4]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         NB := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
       end;
  'C': bin := not bin;     {toggle display 0s and 1s/like CSIRAC}
  'D': displayD := not(displayD); {toggle display D registers/last 16 cmds}
  'E': begin {edit memory}
         repeat
           write('Enter address to be edited as two scale32 numbers ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 2 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=2) and (code[1]=0) and (code[2]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         Maddr := Longint(32*s32[1] + s32[2]);
         repeat
           writeln;
           write('The current memory content is ');
           cmd := LtoC(M[Maddr]);
           adhi := (cmd and $000F8000) shr 15;
           adlo := (cmd and $00007C00) shr 10;
           so   := (cmd and $000003E0) shr 5;
           de   := cmd and $0000001F;
           writeln(adhi:3,adlo:3,sourcem[so]:3,destinationm[de]:3);
           writeln;
           write('Enter new memory content as either ');
           writeln('four scale32 numbers separated by spaces or');
         write('two scale32 numbers and source and destination mnemonics ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 4 then
           begin
            for n := 1 to 2 do
            begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
            end;
            for n := 3 to 4 do
            begin
              sn[n] := Parserfn(ss,n);
              {insert leading space if necessary}
              if length(sn[n])=1 then sn[n] := ' '+sn[n];
            end;
            DecodeSource(sn[3],s32[3],code[3]);
            DecodeDestination(sn[4],s32[4],code[4]);
           end;
           OK:= (ns=4) and (code[1]=0) and (code[2]=0)
                       and (code[3]=0) and (code[4]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         M[Maddr] := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
       end;
  'U': begin {Use data file}
         ReadData := not ReadData;
         LineNo := 0;
         if ReadData then write('Set to read from data file')
                      else write('Set to read from program file');
                      delay(1000);
       end;
  'H': begin {set Halt selector (Trigger Stop)}
         TriggerStop := not(TriggerStop);
         if TriggerStop then
         repeat
           write('Enter Address as two scale32 numbers separated by spaces ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 2 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=2) and (code[1]=0) and (code[2]=0);
          if not OK then writeln('Error(s) in input data. Please try again.')
          else TriggerAddress := Longint(32*s32[1] +s32[2])*p11;
         until OK;
       end;
  'K': begin {toggle NA&S to K switch}
         NAS2K := not(NAS2K);
       end;
  'Q': begin {Quick look at register and memory display}
         display;
         window(1,22,80,25);
         gotoXY(1,4); write('Press a key to return to Options menu');
         window(1,1,80,25);
         ch := readkey;
       end;
  'M': begin {set memory display start address}
         repeat
           write('Enter starting address as two scale32 numbers ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 2 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=2) and (code[1]=0) and (code[2]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         Mstart := Longint(32*s32[1] + s32[2]);
       end;
  'N': begin {toggle NA to K switch}
         NA2K := not(NA2K);
       end;
  '1': begin {toggle one-shot switch}
         OneShot := not(OneShot);
       end;
  'L': begin {Load Primary & Control T001 in 0,0 to 0,24}
         {longint representation of Primary & Control T001 as stored}
         PC[0] := 562; PC[1] := 601; PC[2] := 709; PC[3] := 601;
         PC[4] := 760; PC[5] := 677; PC[6] := 376; PC[7] := 474;
         PC[8] := 288; PC[9] := 783; PC[10] := 49; PC[11] := 565;
         PC[12] := 601; PC[13] := 663; PC[14] := 728; PC[15] := 24581;
         PC[16] := 23557; PC[17] := 15365; PC[18] := 19744; PC[19] :=361303;
         PC[20] := 1038170; PC[21] := 12107; PC[22] := 11095; PC[23] := 443;
         PC[24] := 1024398;
         for i := 0 to 24 do M[i] := PC[i];
         PrimaryStored := true;
         write('Primary and Control stored');  delay(1000);
       end;
  'P': begin {read in another program}
         ReadData := false;
         first := true; screen := false;
         GotoXY(1,1);
         writeln('The current settings are:');
         write('Reader Selector: ');
         if read5 then write('5 HOLE reading DATA    ') else
                       write('12 HOLE reading PROGRAM');
         write('    Punch Selector: ');
         if punch5 then writeln('5 HOLE') else writeln('12 HOLE');
         gotoXY(1,25);
         tries := 0;
         repeat
           write('Enter new program filename '); Readln(ProgramFname);
           pexist := Exist(ProgramFname);
           if not pexist then
           writeln(ProgramFname,' does not exist. Try again.');
           tries := tries + 1;
         until (pexist) or (tries = 3);
         if tries = 3 then
         begin
           writeln('3 tries and you''re out'); Cleanup;
         end;
         assign(Pfile,ProgramFname); SetTextBuf(Pfile,bufi); reset(Pfile);
         write('Does the new program start with a Primary (Y/N)? ');
         ch := readkey; ch := UpCase(ch);  writeln(ch);
         Clearmem := (ch = 'Y');
         Initialize;
         TellInitialSettings;
         if Clearmem then ReadPrimary;
       {  if not PrimaryStored then TellInitialSettings; }
         S := 0;
         if screen then Display else writeln('Reading program....');
         Execute;
         Cleanup;
       end;
  'S': begin
         S := 0;  {clear sequence register}
         Sclear := true;
         write('Sequence register cleared');  delay(1000);
       end;
  'T': begin    {TSP a section of memory}
         p := pos('.',ProgramFname);
         if p <> 0 then TSPFname := Copy(ProgramFname,1,p)+'TSP'
                   else TSPFname := ProgramFname + '.TSP';
         writeln('Enter Filename for memory TSP output,');
         write('or just RETURN to accept default of ',TSPFname,' ');
         readln(Fname);
         if (Fname <>'') then TSPFname := Fname;
         repeat
           write('Press M to TSP from Memory or D to TSP from drum ');
           st := readkey; st := Upcase(st); writeln(st);
         until st in ['M','D'];
         repeat
           write('Enter starting address as two scale32 numbers ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 2 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=2) and (code[1]=0) and (code[2]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         StartAddress := Longint(32*s32[1] + s32[2]);
         repeat
           write('Enter finish address as two scale32 numbers ');
           readln(ss);
           ns := Parsenfn(ss);
           if ns = 2 then for n := 1 to ns do
           begin
             sn[n] := Parserfn(ss,n);
             Val(sn[n],si,code[n]);
             if (si >= 0) and (si < 32) then s32[n] := si else code[n] := 1;
           end;
           OK:= (ns=2) and (code[1]=0) and (code[2]=0);
          if not OK then writeln('Error(s) in input data. Please try again.');
         until OK;
         FinishAddress := Longint(32*s32[1] + s32[2]);
         TSP(StartAddress,FinishAddress,TSPFname);
       end;
  'V': begin
         VideoOff := true;
         write('Video turned off during program execution'); delay(1000);
       end;
  'W': begin
         write('Enter Filename for memory dump output ');
         readln(Fname);
         Assign(Store,Fname); Rewrite(Store);
         for n := 0 to 767 do writeln(Store,CtoL(M[n]));
         Flush(Store); Close(Store);
       end;
  'X': begin  {eXit to Operating System with optional view of output}
         if exist(Tfname) then begin Flush(FoutT); Close(FoutT); end;
         if exist(Ffname) then begin Flush(FoutF); Close(FoutF); end;
         write('View output (Y/N)? ');
         ch := readkey; ch := UpCase(ch);
         writeln;
         if (ch = 'Y') then
         if exist(Tfname) then
         begin
           begin
             Assign(FoutT,TFname); reset(FoutT);
             while not eof(FoutT) do
             begin
               readln(FoutT,cstring);
               writeln(cstring);
             end;
             Close(FoutT);
           end;
           if exist(Ffname) then
           begin
             Assign(FoutF,FFname); reset(FoutF);
             while not eof(FoutF) do
             begin
               readln(FoutF,cstring);
               writeln(cstring);
             end;
             Close(FoutF);
           end;
           write('Press RETURN to exit to Operating System');
           ch := readkey;
         end;
         Cleanup;
         ClrScr;
       end;
  end;
 until option = #13;
 ClrScr;
 Display;
end; {console}

procedure continue;
var ch: char;
    n,ns,si: integer;
    ss: string;
    sn: array[1..4] of string;
    code: array[1..4] of integer;
    OK: boolean;
begin
  begin
    window(1,22,80,25);
    gotoXY(1,{25}4);
   repeat
    if first then
    begin
      if screen then
      begin
        write('Press O for options, use Shortcut Menu or RETURN');
        write(' to execute program ');
      end else
      begin
        write('Press O for options or RETURN');
        write(' to read program into memory ');
      end;
    end else if OneShot then
    begin
      write('Press O for options, use Shortcut Menu or RETURN');
      write(' to execute next instruction ');
      end else
    begin
      write('Press O for options, use Shortcut Menu or RETURN');
      write(' to execute program ');
    end;
    ch := readkey; ch := UpCase(ch);
    window(56,6,80,18);
    case ch of
    'R': begin
           read5 := not Read5;
           gotoXY(1,1);
           write('R. READER: ');
           if read5 then write('5 HOLE ') else write('12 HOLE');
         end;
    'U': begin
           ReadData := not ReadData;
           gotoXY(1,2);
           write('U. Use ');
           if ReadData then write('data file   ')
                       else write('program file');
           ClrEol;
         end;
    'K': begin
           NAS2K := not(NAS2K);
           gotoXY(1,3);
           write('K. NA&S to K: ');
           if NAS2K then write('ON ') else write('OFF');
         end;
    'N': begin
           NA2K := not(NA2K);
           gotoXY(1,4);
           write('N. NA to K: ');
           if NA2K then write('ON ') else write('OFF');
         end;
    'Z': begin
           punch5 := not punch5;
           gotoXY(1,5);
           write('Z. Punch: ');
           if punch5 then write('5 HOLE ') else write('12 HOLE');
         end;
    'A': begin
           gotoXY(1,6);
           write('A. Enter value '); ClrEol;
           ItoC32(NA shr 10,s32[1],s32[2]);
           ItoC32(NA and $3FF,s32[3],s32[4]);
           readln(s32[3]);
           gotoXY(1,6);
           write('A. Set NA Reg.(P6 units)');
           window(1,1,80,25);
           gotoXY(28,4);
           write('NA',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
           NA := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
           window(56,6,80,18);
         end;
    'B': begin
           gotoXY(1,7);
           write('B. Enter value '); ClrEol;
           ItoC32(NB shr 10,s32[1],s32[2]);
           ItoC32(NB and $3FF,s32[3],s32[4]);
           readln(s32[4]);
           gotoXY(1,7);
           write('B. Set NB Reg.(PL units)');
           window(1,1,80,25);
           gotoXY(44,4);
           write('NB',s32[1]:3,s32[2]:3,s32[3]:3,s32[4]:3);
           NB := Longint(32*s32[1]+s32[2])*p11 + 32*s32[3] +s32[4];
           window(56,6,80,18);
         end;
    'I': begin
           gotoXY(1,8);
           write('I. Enter value '); ClrEol;
           ItoC32( IS shr 10,s32[1],s32[2]);
           ItoC32( IS and $3FF,s32[3],s32[4]);
           readln(s32[3]);
           gotoXY(1,8);
           write('I. Set  I Reg.(P6 units)');
           window(1,1,80,25);
           IS := C32toI(s32[3],0);
           gotoXY(2,4);  write('I '); writebin(I or IS,20);
           window(56,6,80,18);
         end;
    'S': begin
           S := 0;
           Sclear := true;
           gotoXY(1,9);
           write('S. Clear S ');
           write('cleared'); Delay(1000);
           gotoXY(1,9); write('S. Clear S','':8);
           window(1,1,80,25);
           gotoXY(2,3); write('S '); writebin(S,20);
           window(56,6,80,18);
         end;
    '1': begin
           OneShot := not OneShot;
           gotoXY(1,10);
           write('1. One Shot: ');
           if OneShot then write('ON ') else write('OFF');
         end;
    'H': begin
           TriggerStop := not TriggerStop;
           gotoXY(1,11);
           write('H. Trigger Stop: ');
           if TriggerStop then write('ON ') else write('OFF');
           gotoXY(1,12); write('':20);
           if TriggerStop then
           begin
            repeat
             gotoXY(4,12);
             write('Enter address ');
             readln(ss);
             ns := Parsenfn(ss);
             if ns = 2 then for n := 1 to ns do
             begin
               sn[n] := Parserfn(ss,n);
               Val(sn[n],si,code[n]);
               if (si >= 0) and (si < 32)
                then s32[n] := si else code[n] := 1;
             end;
             OK:= (ns=2) and (code[1]=0) and (code[2]=0);
             if not OK then
              writeln('Error(s) in input data. Please try again.');
            until OK;
            TriggerAddress := Longint(32*s32[1] +s32[2])*p11;
            ItoC32(TriggerAddress shr 10,s32[1],s32[2]);
            gotoXY(4,12); ClrEol;
            write('Address: ',s32[1]:3,s32[2]:3,'':4);
           end;
         end;
    'X': begin
           if exist(Tfname) then begin Flush(FoutT); Close(FoutT); end;
           if exist(Ffname) then begin Flush(FoutF); Close(FoutF); end;
           gotoXY(1,13);
           write('X. Exit');
           Cleanup;
         end;
    end;
      window(1,22,80,25);
      gotoXY(1,4); ClrEol;
   until (ch = 'O') or (ch = #13);
    window(1,1,80,25);
    gotoXY(1,22); ClrEol;
    gotoXY(1,23); ClrEol;
    gotoXY(1,24); ClrEol;
    if ch = 'O' then Console;
  end;
end;

Function Read5H: Longint;   {TO READ 5h PROGRAM ONLY}
{convert ascii character to Flexowriter code and express as longint.
 b indicates blank tape, f indicates figure shift, l indicates letter
 shift, s indicates stop, t indicates TAB, p indicates œ
 e indicates erase. }
const FS: boolean = true;    {start in FS}
      lastch: char = #31;
var n: integer;
    ch: char;
begin
    read(Pfile,ch);
    {omit LF after CR}
    if (lastch = #13) and (ch = #10) then read(Pfile,ch);
    if (eof(Pfile)) then
    begin
      gotoXY(1,25); writeln('Unexpected EOF on 5-hole file'); Console;
    end;
    case ch of
      'b',#0: n:= 0;
     '1','Q': n:= 1; '2','W': n:= 2; '*','C': n:= 3; '4','R': n:= 4;
     '(','K': n:= 5; ')','L': n:= 6; '7','U': n:= 7; '8','I': n:= 8;
     '#','D': n:= 9; '=','V': n:=10; '-','A': n:=11; '&','F': n:=12;
     '.','M': n:=13; 't','G': n:=14; ',','N': n:=15; '0','P': n:=16;
     's','J': n:=17; 'p','H': n:=18; '3','E': n:=19; '''','B':n:=20;
     '5','T': n:=21; '6','Y': n:=22; '/','S': n:=23; 'x','X': n:=24;
     '9','O': n:=25; '+','Z': n:=26;     ' ': n:=28;     #13: n:=29;
         'f': n:=27;     'l': n:=30;
     else n:=31;
    end; {case}
    lastch := ch;
    Read5H := Longint(n);
end;

Procedure Write5H(s: Longint);   {TO WRITE 5h PROGRAM ONLY}
{convert Flexowriter code to ascii character and write to output file.
 b indicates blank tape, f indicates figure shift, l indicates letter
 shift, s indicates stop, t indicates TAB, p indicates œ,
 e indicates erase}
var
    ch: char;
begin
  cout := (s and $1F) or ((s and $7C00) shr 10);
  case cout of
      0: ch := 'b'; 1: ch := '1'; 2: ch := '2'; 3: ch := '*';
      4: ch := '4'; 5: ch := '('; 6: ch := ')'; 7: ch := '7';
      8: ch := '8'; 9: ch := '#'; 10: ch := '='; 11: ch := '-';
      12: ch := '&'; 13: ch := '.'; 14: ch := 't'; 15: ch := ',';
      16: ch := '0'; 17: ch := 's'; 18: ch := 'p'; 19: ch := '3';
      20: ch := ''''; 21: ch := '5'; 22: ch := '6'; 23: ch := '/';
      24: ch := 'x'; 25: ch := '9'; 26: ch := '+'; 27: ch := 'f';
      28: ch := ' '; 29: ch := ^M; 30: ch := 'l'; 31: ch :='e';
  end; {case}
  write(FoutF,ch);
end;

Function Input5: Longint;   {TO READ 5h DATA ONLY}
{convert ascii character to Flexowriter code and express as longint,
 keeping track of whether in LS or FS. b indicates blank tape
 f indicates figure shift, l indicates letter shift, s indicates stop
 It is sometimes necessary to explicitly indicate f or l  }
const j: integer = 1;
     FS: boolean = true;    {start in FS}
     firsti: boolean = true;
var{ dline: string;}
    n: integer;
    ch: char;
begin
  if firsti then
  begin
    readln(Dfile,dline);
    Input5 := Longint(27);     {output FS as first character}
    firsti := false; exit;
  end;
  if j <= length(dline) then ch := dline[j];
  if j > length(dline) then
  begin
    j := 1;
    if (eof(Dfile)) {and (j > (Length(dline)+1))} then
    begin
      gotoXY(1,25); writeln('Unexpected EOF on 5-hole data file');
      Close(FoutT); Close(FoutF); Cleanup;
    end;
    readln(Dfile,dline);
    Input5 := Longint(29);   {CR}
    exit;
  end;
    if FS and (ch in ['A'..'Z']) then    {output LS}
    begin
      Input5 := Longint(30);   {LS}
      FS := false;
      exit;
    end;
    if not FS and (ch in ['0'..'9','*','(',')','#','=','-','&','.',#9,',',
                          's','œ','''','/','x','+']) then  {output FS}
    begin
      Input5 := Longint(27);   {FS}
      FS := true;
      exit;
    end;
    case ch of
      'b',#0: n:= 0;
     '1','Q': n:= 1; '2','W': n:= 2; '*','C': n:= 3; '4','R': n:= 4;
     '(','K': n:= 5; ')','L': n:= 6; '7','U': n:= 7; '8','I': n:= 8;
     '#','D': n:= 9; '=','V': n:=10; '-','A': n:=11; '&','F': n:=12;
     '.','M': n:=13;  #9,'G': n:=14; ',','N': n:=15; '0','P': n:=16;
     's','J': n:=17; 'œ','H': n:=18; '3','E': n:=19; '''','B':n:=20;
     '5','T': n:=21; '6','Y': n:=22; '/','S': n:=23; 'x','X': n:=24;
     '9','O': n:=25; '+','Z': n:=26;     ' ': n:=28;     #13: n:=29;
         'f': n:=27;     'l': n:=30;
     else n:=31;
    end; {case}
    Input5 := Longint(n);
    j := j + 1;
end;

Function ReadaLine(var F: text): longint;
{Read a tape row in m nXY format from program or data tape
 according to what F is and convert to a longint
 Called when I source is encountered and 12-hole reader is selected}
var row: st7;
    idec: longint;
begin
  if not eof(F) then
  begin
    row := '       '; {make sure that row[6] and row[7] are blank}
    readln(F,row);
    LineNo := LineNo+1;
    RowToI(row,idec,error);
    if error then
    begin
      GotoXY(1,25); writeln('Error on line ',LineNo);
      Cleanup;
    end;
    ReadaLine := idec;
  end else ReadaLine := 0;
end;

procedure Execute;
var ch: char;
    Msigt,Lsigt,multiplicand,count: Longint;
    s1,s2,GotKey: boolean;

procedure LeftShift(source: longint; var A,B: longint);
var dunit,dunito,carry,As,Bs: longint;
    j,n: integer;
begin
  if (source and p20) <> 0 then
  begin
    n := (source and $3C00) shr 10;
    case n of
    0..13: begin
             if (A and p20) <> 0 then dunito := 1 else dunito := 0;
             for j := 0 to n div 2 do
             begin
               dunit := dunito;
               if (A and p20) <> 0 then dunito := 1 else dunito := 0;
               if (B and p20) <> 0 then carry := 1 else carry := 0;
               Bs := LtoC((B shl 1) + dunit);
               As := LtoC((A shl 1) + carry);
               A := As; B := Bs;
             end;
           end;
    14,15: begin {8 left shifts leaves A, B unchanged}
             As := A; Bs := B;
             If (As and p20) <> 0 then dunito := 1 else dunito := 0;
           end;
    end; {case}
    {« left shifts - (A) and (B) become respectively the 2(B) and (A)
     of the preceding even n}
    if odd(n) then begin 
                     B := As;
                     A :=LtoC((Bs shl 1) + dunito);
                   end;
  end;
end;

begin
  count := 0;  GotKey := false;
  FST := true;    {assume figure shift initially for OT}
  FSF := true;    {  "      "      "       "     for OP}
  src := 0; des := 0;
  {clear array to hold last 16 commands executed}
  for nc := 0 to 15 do Buf16[nc] := 0;
  nc := 0;
  PlusK := false;
  Sclear := false;
  if VideoOff then
  begin
    screen := false;
    ClrScr; writeln('Executing program............');
  end;
  repeat
    cmd := LtoC(M[S shr 10]);            {read command from memory}
    if PlusK then cmd := LtoC(cmd+K);
    PlusK := false;
    if (not displayD) and OneShot then
    begin {display last 16 commands executed}
      if screen then
      begin
        for n := 0 to 15 do
        begin
          gotoXY(4,6+n);
          writebin(Buf16[n],20);
        end;
        gotoXY(3,5);
        write('Last 16 commands executed');
      end;
    end;
      for nc := 14 downto 0 do Buf16[nc+1] := Buf16[nc];
      Buf16[0] := cmd;
    {decode into 4 scale32 numbers for
     address(hi and lo),source,destination}
    if NAS2K then K := NA or S else if NA2K then K := NA else K := cmd;
    adhi := (K and $000F8000) shr 15;
    adlo := (K and $00007C00) shr 10;
    src  := (K and $000003E0) shr 5;
    des  :=  K and $0000001F;

    {note - checking with (S and $$000FFC00) would check p11-p20 omly}
    {set flag true if machine to be stopped after current instruction}
    StopFlag :=  (TriggerStop and (TriggerAddress = S));
    Address := C32toI(adhi,adlo);
    dad := adlo and $F;            {D-address}
    {increment sequence register}
    S := LtoC(S+p11);
    {if S exceeds 24,0 increment it until it overcarries to zero}
    if (S shr 10) > C32toI(24,0) then
    begin
      repeat S := S+p11 until (LtoC(S) = 0);
      S := LtoC(S);
    end;
    {decode source function gates}
    case src of
     0: {M} source := M[Address];
     1: {I}  begin
               source := I or IS; {needed for correct read of 5H program}
               {5-hole program}
               if read5 and (not Primarystored) and (not ReadData)
               then begin
                      I := Read5H;
                  {    source := I or IS; wrecks 5H program if here}
                      if bootstrap and (I = 29) then
                      {stop on receipt of first 29}
                      begin bootstrap := false; stopflag := true; end
                    end
               else {5-hole data}
               if read5 and dexist then
               begin
                 I := Input5;
                 source := I or IS;  {needed here for 5H data}
               end
               else {12-hole data}
               if ReadData then I := ReadaLine(Dfile)
               else {12-hole program}
               begin
               if eof(Pfile) then
               begin
                 ClrScr;
                 writeln('Unexpected End of File - probably missing DO ');
                 writeln('or no blank rows at end of tape');
                 Cleanup;
               end;
               if not read5 then I := ReadaLine(Pfile);
               end;
               if screen then
               begin
                 gotoXY(2,4);  write('I '); writebin(I or IS,20);
               end;
             end;
     2: {NA} source := NA;
     3: {NB} source := NB;
     4: {A}  source := A;
     5: {SA} if (A and p20) <> 0 then source := p20 else source := 0;
     6: {HA} if (A and p20) <> 0 then source := (A shr 1) or p20
                                 else source := A shr 1;
     7: {TA} source := A shl 1;
     8: {LA} if odd(A) then source := p1 else source := 0;
     9: {CA} begin source := A; A := 0;
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
    10: {ZA} if (A = 0) then source := 0 else source := p1;
    11: {B}  source := B;
    12: {R}  if (B and p20) <> 0 then source := p1 else source := 0;
    13: {RB} source := B shr 1;
    14: {C}  source := C;
    15: {SC} if (C and p20) <> 0 then source := p20 else source := 0;
    16: {RC} source := C shr 1;
    17: {D}  source := D[dad];
    18: {SD} if (D[dad] and p20) <> 0 then source := p20 else source := 0;
    19: {RD} source := D[dad] shr 1;
    20: {Z}  source := 0;
    21: {HL} source := H;
    22: {HU} source := H shl 10;
    23: {S}  source := S;
    24: {PE} source := p11;
    25: {PL} source := p1;
    26: {K}  source := K and $FFC00;  {select p11-p20}
    27: {MA} source := MA[Address];
    28: {MB} begin {not implemented} end;
    29: {MC} begin {not implemented} end;
    30: {MD} begin {not implemented} end;
    31: {PS} source := p20;
    end;
    source := LtoC(source); {lose any overcarry beyond p20}
    case des of
     0: {M}  begin
               M[Address] := source;
               if screen then
               begin
                 if (Address >= Mstart) and (Address <= (Mstart+15)) then
                 begin
                   gotoXY(31,6+(Address-Mstart)); writebin(M[Address],20);
                 end;
               end;
             end;
     1: {Q}  begin {no effect} end;
     2: {OT} begin
               OTused := true;
               cout := (source and $1F) or ((source and $7C00) shr 10);
               case cout of
               0..26: begin
                        if fst then begin
                                      write(FoutT,TF[cout]);
                                      OTBuffer[OTcount] := TF[cout];
                                    end else
                                    begin
                                      write(FoutT,TL[cout]);
                                      if OTcount <700 then
                                      OTBuffer[OTcount] := TL[cout];
                                    end;
                        OTcount := OTcount + 1;
                      end;
                  27: begin
                        fst := true; write(FoutT,' ');
                        if OTcount < 700 then OTBuffer[OTcount] := ' ';
                        OTcount := OTcount + 1;
                      end;
                  28: begin
                        fst := false; write(FoutT,' ');
                        if OTcount < 700 then OTBuffer[OTcount] := ' ';
                        OTcount := OTcount + 1;
                      end;
                  29: begin
                        write(FoutT,#10); write(FoutT,' ');  {LF}
                        if OTcount < 699 then
                        begin
                          OTBuffer[OTcount] := #10;
                          OTcount := OTcount + 1;
                          OTBuffer[OTcount] := ' ';
                          OTcount := OTcount + 1;
                        end;
                      end;
                  30: begin
                        write(FoutT,#13);   {carriage return}
                        if OTcount < 700 then OTBuffer[OTcount] := #13;
                        OTcount := OTcount + 1;
                      end;
                  31: begin
                        write(FoutT,' ');
                        if OTcount < 700 then OTBuffer[OTcount] := ' ';
                        OTcount := OTcount + 1;
                      end;
               end; {case}
               if screen then
               begin
                 gotoXY(47,2); write('O '); writebin(Longint(cout),5);
               end;
             end;
     3: {OP} begin
               if FirstOP then
               begin
                 {check for Interprogram by checking for the presence
                  of 11 3 M A in 11,0 and 11 14 K HU in 11,1. If present,
                 use special routine to output 5H program}
                 Output5hprog := (M[352] = 363524) and (M[353] = 375638);
                 FirstOP := false;
                 if Output5hprog then
                 begin
                   pd := pos('.',DataFname);
                   if pd <> 0 then Ffname := Copy(DataFname,1,pd)+'5H'
                              else Ffname := DataFname+'.5H';
                 end else
                 begin
                   if dexist then   {use DataFname if it exists}
                   begin
                     pd := pos('.',DataFname);
                     if pd <> 0 then Ffname := Copy(DataFname,1,pd)+'OP'
                                else Ffname := DataFname+'.OP';
                   end else         {use ProgramFname}
                   begin
                     pd := pos('.',ProgramFname);
                     if pd <> 0 then Ffname := Copy(ProgramFname,1,pd)+'OP'
                                else Ffname := ProgramFname+'.OP';
                   end;
                 end;
                 Assign(FoutF,Ffname); SetTextBuf(FoutF,bufo);
                 Rewrite(FoutF);
               end;
               if Output5hprog and FirstStop then
               begin
                 cout := (source and $1F) or ((source and $7C00) shr 10);
                 write5H(source);
               end
               else
               if punch5 then    {5 hole punch}
               begin             {convert Flexowriter code to ASCII}
                 cout := (source and $1F) or ((source and $7C00) shr 10);
                 gotoXY(1,24);
                 case cout of
                 0..26: begin
                          if fsf then write(FoutF,FF[cout])
                                 else write(FoutF,FL[cout]);
                          FirstStop := FF[cout] = 's';
                        end;
                    27: fsf := true;
                    28: write(FoutF,' ');
                    29: writeln(FoutF);
                    30: fsf := false;
                    31: ;
                 end; {case}
               end else
               begin             {12 hole punch}
                 high := (source and $000003E0) shr 5;  {p10 to p6}
                 low := ((source and $00007C00) shr 10) {p15 to p11}
                        or (source and $0000001F);      {p5 to p1}
                 write(FoutF,high:2,low:3);
                 if ((source and p19) <> 0) then write(FoutF,'X')
                                            else write(FoutF,' ');
                 if ((source and p20) <> 0) then writeln(FoutF,'Y')
                                            else writeln(FoutF,' ');
               end;
               if screen then
               begin
                 gotoXY(47,2); write('O '); writebin(Longint(cout),5);
               end;
             end;
     4: {A}  begin
               A := source;
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
     5: {PA} begin
               A := LtoC(CtoL(A)+CtoL(source));
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
     6: {SA} begin
               if (source = p20) and (A = 0) then A := p20 else
               A := LtoC(CtoL(A)-CtoL(source));
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
     7: {CA} begin
               A := LtoC(A and source);
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
     8: {DA} begin
               A := LtoC(A or source);
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
     9: {NA} begin
               A := LtoC(A xor source);
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
               end;
             end;
    10: {P}  begin
               if source <> 0 then
               begin sound(220);
                 Delay(4); NoSound;
               end;
             end;
    11: {B}  begin
               B := source;
               if screen then
               begin
                 gotoXY(29,1); write('B '); writebin(B,20);
               end;
             end;
    12: {XB} begin {form C x B by successive addition}
               Msigt := 0; Lsigt := 0;
               {trap multiplication by zero}
               if ((source = 0) or (C = 0))
               then begin Msigt := 0; Lsigt := 0; end else
               {trap (-1)x(-1) which becomes (-1)}
               if ((source = p20) and (C = p20))
               then begin Msigt := p20; Lsigt := 0; end else
               {multiplier or multiplicand = -1}
               if (source = p20) then Msigt := LtoC(-C)  else
               if (C  = p20) then Msigt := LtoC(-source) else
               begin
                 {record signs of multiplier and multiplicand}
                 s1 := (source and p20) <> 0;
                 s2 := (C and p20) <> 0;
                 begin
                   {complement if negative}
                   if s1 then Lsigt := LtoC(-source)
                         else Lsigt := source;
                   if s2 then multiplicand := LtoC(-C)
                         else multiplicand:= C;
                   {multiplication for unsigned numbers}
                   Msigt := 0;
                   for j := 1 to 19 do
                   begin
                     if odd(Lsigt) then Msigt := Msigt + multiplicand;
                     carry := odd(Msigt);
                     Msigt := Msigt shr 1;
                     Lsigt := Lsigt shr 1;
                     if carry then Lsigt := Lsigt + p20;
                   end;
                 end;
                 {adjust sign of product if signs differ}
                 if (s1 <> s2) then {complement result}
                 begin
                   Lsigt := LtoC(-Lsigt);
                   if Lsigt <> 0 then Msigt := Msigt+p1;
                   Msigt := LtoC(-Msigt) or p20;
                 end;
               end;
               B := Lsigt;
               { add top 20 digits of product to A, losing overcarry }
               A := LtoC(A + Msigt);
               {zero p1 of B}
               B := B and $FFFFE;
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
                 gotoXY(29,1); write('B '); writebin(B,20);
               end;
             end;
    13: {L}  begin
               ShiftAddress := LtoC(source or (K and $FFC00));
               LeftShift(ShiftAddress,A,B);
               if screen then
               begin
                 gotoXY(2,1); write('A '); writebin(A,20);
                 gotoXY(29,1); write('B '); writebin(B,20);
               end;
             end;
    14: {C}  begin
               C := source;
               if screen then
               begin
                 gotoXY(2,2); write('C '); writebin(C,20);
               end;
             end;
    15: {PC} begin
               C := LtoC(CtoL(C)+CtoL(source));
               if screen then
               begin
                 gotoXY(2,2); write('C '); writebin(C,20);
               end;
             end;
    16: {SC} begin
               if (source = p20) and (C = 0) then C := p20 else
               C := LtoC(CtoL(C)-CtoL(source));
               if screen then
               begin
                 gotoXY(2,2); write('C '); writebin(C,20);
               end;
             end;
    17: {D}  begin
               D[dad] := source;
               if screen then
               begin
                 if displayD then
                 begin
                   gotoXY(4,6+dad); writebin(D[dad],20);
                 end;
               end;
             end;
    18: {PD} begin
               D[dad] := LtoC(CtoL(D[dad])+CtoL(source));
               if screen then
               begin
                 if displayD then
                 begin
                   gotoXY(4,6+dad); writebin(D[dad],20);
                 end;
               end;
             end;
    19: {SD} begin
               if (source = p20) and (D[dad] = 0) then D[dad] := p20 else
               D[dad] := LtoC(CtoL(D[dad])-CtoL(source));
               if screen then
               begin
                 if displayD then
                 begin
                   gotoXY(4,6+dad); writebin(D[dad],20);
                 end;
               end;
             end;
    20: {Z} ; {no effect}
    21: {HL} begin
               H := source and $3FF;
               if screen then
               begin
                 gotoXY(29,2); write('H '); writebin(H,10);
               end;
             end;
    22: {HU} begin
               H := (source and $FFC00) shr 10;
               if screen then
               begin
                 gotoXY(29,2); write('H '); writebin(H,10);
               end;
             end;
    23: {S}  begin
               S := source;
             end;
    24: {PS} begin
               S := LtoC(S + source);
               if (S shr 10) > C32toI(24,0) then
               begin
                 writeln('S out of range - machine halted');
                 Cleanup;
               end;
             end;
    25: {CS} begin
               {increment S if p1-p11 non-zero}
               if (source and $7FF) <> 0 then S := LtoC(S + p11);
               {increment S if p15-p20 non-zero}
               if (source and $FC000) <> 0 then S := LtoC(S + p11);
             end;
    26: {PK} begin
               K := source; PlusK := true;
               if screen then
               begin
                 gotoXY(60,2); write('K '); writebin(K shr 10,10);
               end;
             end;
    27: {MA} begin
               MA[Address] := source;
               DrumWrite := true;
               MAA := source;
               if screen then
               begin
                 gotoXY(28,3); write('MA '); writebin(MAA,20);
               end;
             end;
    28: {MB} ;
    29: {MC} ;
    30: {MD} ;
    31: {T}  StopFlag := (source <> 0);
    end;{case}
    if screen then
    begin
      gotoXY(2,3); write('S '); writebin(S,20);
      gotoXY(60,2); write('K '); writebin(K shr 10,10);
      gotoXY(76,2); write(sourcem[src],' ', destinationm[des]);
      gotoXY(1,23); writeln; writeln;
    end;
    Inc(count);
    if (count mod 500) = 0 then Gotkey := Keypressed;
    if StopFlag or OneShot or GotKey then
    begin
      if GotKey then ch := readkey;
      display;
      StopFlag := false; GotKey := false;
      continue;
      if VideoOff then begin
                         screen := false;
                         ClrScr; write('Executing program..........');
                       end;
    end;
    first := false;
    if Sclear then begin Sclear := false; S := 0; PlusK := false; end;
  until false;
end; {Execute}


begin   {Main Program}
  VideoOff := false;
  clrscr;
  {recover drum contents from file MAHOLD else clear MA}
  if Exist('MAHOLD') then
  begin
    Assign(Hold,'MAHOLD'); Reset(Hold);
{$I-}
    for n := 0 to 1023 do readln(Hold,MA[n]);
    for n := 0 to 1023 do MA[n] := LtoC(MA[n]);
{$I+}
  if IOResult <> 0 then writeln('Error in reading from MAHOLD');
  end else for n := 0 to 1023 do MA[n] := 0;
  Textcolor(Yellow);
  ReadData := false;      {read from program tape, not data tape}
  PrimaryStored := false;
  Clearmem := true;
  screen := false;
  LineNo := 0;
  nline := Maxint;
  first := true;
{  firsti := true;}
  bin := true;
  displayD := true;       {display D registers}
  read5 := false;         {read from 12-hole reader as default}
  punch5 := true;         {select 5-hole punch as default}
  NA2K := false;          {NA to K switch OFF}
  NAS2K := false;         {NA&S to K switch OFF}
  DrumWrite := false;
  OTcount := 1;
  OTused := false;
  tries := 0;
  pexist := false; dexist := false;
  Bootstrap := true;
  FirstStop := false;
  FirstOP := true;
  if ParamCount >= 1 then
  begin
    ProgramFname := ParamStr(1);
    pexist := Exist(ProgramFname);
  end;
  if (Paramcount < 1) or (not pexist) then
  begin
    repeat
      write('Enter program filename '); Readln(ProgramFname);
      pexist := Exist(ProgramFname);
      if not pexist then
      writeln(ProgramFname,' does not exist. Try again.');
      tries := tries + 1;
    until (pexist) or (tries = 3);
    if tries = 3 then
    begin
      writeln('3 tries and you''re out'); Halt;
    end;
  end;
  tries := 0;
  if ParamCount = 2 then
  begin
    DataFname := ParamStr(2);
    dexist := Exist(DataFname);
  end;
  if (Paramcount <> 2) or (not dexist) then
  begin
    repeat
      write('Enter data filename (Return if none) '); Readln(DataFname);
      if Length(DataFname) <> 0 then
      begin
        dexist := Exist(DataFname);
        if not dexist then
        writeln(DataFname,' does not exist. Try again.');
        tries := tries + 1;
      end;
    until (dexist) or (tries = 3) or (Length(DataFname) = 0);
    if tries = 3 then
    begin
      writeln('3 tries and you''re out'); Halt;
    end;
  end;
  if dexist then begin Assign(Dfile,DataFname); Reset(Dfile); end;
  assign(Pfile,ProgramFname); SetTextBuf(Pfile,bufi); reset(Pfile);
  Initialize;
  TellInitialSettings;
  {read in primary if it has not been loaded from memory with P option}
  if (not PrimaryStored) and (not read5) then ReadPrimary;
  {set up .OT and .OP files for holding output}
  if dexist then   {use DataFname if it exists}
  begin
    pd := pos('.',DataFname);
    if pd <> 0 then Tfname := Copy(DataFname,1,pd)+'OT'
               else Tfname := DataFname+'.OT';
  end else         {use ProgramFname}
  begin
    pd := pos('.',ProgramFname);
    if pd <> 0 then Tfname := Copy(ProgramFname,1,pd)+'OT'
               else Tfname := ProgramFname+'.OT';
  end;
  Assign(FoutT,Tfname); Rewrite(FoutT);
  {Clear S to enter the primary which executes to read in the
   control routine, then the rest of the program.
   Reading is terminated on receipt of a DO command, which normally
   leads to a stop command at the head of the program}
  S := 0;
  if screen then Display else writeln('Reading program....');
  Execute;  {execute primary, then program}
  {should never get here}
  if exist(Tfname) then begin Flush(FoutT); Close(FoutT); end;
  if exist(Ffname) then begin Flush(FoutF); Close(FoutF); end;
  Cleanup;
end.














