// A headless Game Boy Advance runner for checking edited Gen 3 saves in the real game (mGBA's library, your own ROM).
// It loads the ROM and a save, runs a script of button presses and takes pictures, and never writes the save back.
//
//   sudo apt-get install libmgba-dev
//   gcc -O2 scripts/gbarun.c -o gbarun -lmgba
//   ./gbarun emerald.gba edited.sav out 'w300; p a 6 200; p a 6 200; p a 6 200; p start 6 200; p a 6 300; w300; s world'
//
// Commands, separated by ';':  wN (run N frames) | p KEY [hold] [after] | h KEY frames | mash N gap [KEY] |
// s NAME (out/NAME.ppm) | m ADDR LEN (print bytes) | poke8/poke16 ADDR VALUE | dumpsav PATH (the save as the game
// holds it now, after an in-game save) | ss PATH / ls PATH (save / load a state). Keys: a b select start right left up down r l.
// The title screen needs four A presses about 200 frames apart before CONTINUE. mGBA logs to stdout; filter "^GBA".
#include <mgba/core/core.h>
#include <mgba/core/serialize.h>
#include <mgba-util/vfs.h>
#include <mgba/gba/interface.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static struct mCore* core; static color_t* buf; static int keys=0;
static void frames(int n){ for(int i=0;i<n;i++){ core->setKeys(core,keys); core->runFrame(core);} }
static int keyid(const char*k){ const char*n[]={"a","b","select","start","right","left","up","down","r","l"}; for(int i=0;i<10;i++) if(!strcmp(k,n[i])) return 1<<i; return 0; }
static void shot(const char*path){ FILE*f=fopen(path,"wb"); fprintf(f,"P6 240 160 255\n"); for(int i=0;i<240*160;i++){ uint32_t c=buf[i]; unsigned char px[3]={c&0xff,(c>>8)&0xff,(c>>16)&0xff}; fwrite(px,1,3,f);} fclose(f); }
int main(int argc,char**argv){
  core=mCoreFind(argv[1]); core->init(core); mCoreInitConfig(core,NULL);
  buf=malloc(240*160*sizeof(color_t)); core->setVideoBuffer(core,buf,240);
  mCoreLoadFile(core,argv[1]);
  if(strcmp(argv[2],"-")){ struct VFile* vf=VFileOpen(argv[2],O_RDONLY); struct VFile* mem=VFileMemChunk(NULL,0); char b[4096]; ssize_t r; while((r=vf->read(vf,b,sizeof b))>0) mem->write(mem,b,r); vf->close(vf); mem->seek(mem,0,SEEK_SET); core->loadSave(core,mem); }
  core->reset(core);
  char*cmds=strdup(argv[4]); char*save=NULL; char*tok=strtok_r(cmds,";",&save); char path[512];
  while(tok){ while(*tok==' ')tok++; char a[64]="",b[256]="",c[64]="",d[64]=""; sscanf(tok,"%63s %255s %63s %63s",a,b,c,d);
    if(a[0]=='w'&&a[1]>='0'&&a[1]<='9') frames(atoi(a+1));
    else if(!strcmp(a,"p")){ int h=c[0]?atoi(c):6, af=d[0]?atoi(d):30; keys|=keyid(b); frames(h); keys&=~keyid(b); frames(af);} 
    else if(!strcmp(a,"h")){ keys|=keyid(b); frames(atoi(c)); keys&=~keyid(b);} 
    else if(!strcmp(a,"mash")){ int n=atoi(b), k=atoi(c); const char*kk=d[0]?d:"a"; for(int i=0;i<n;i++){ keys|=keyid(kk); frames(6); keys&=~keyid(kk); frames(k);} }
    else if(!strcmp(a,"s")){ snprintf(path,sizeof path,"%s/%s.ppm",argv[3],b); shot(path);} 
    else if(!strcmp(a,"m")){ uint32_t ad=strtoul(b,0,16); int n=atoi(c); printf("%s",b); for(int i=0;i<n;i++) printf(" %02x",core->busRead8(core,ad+i)); printf("\n"); }
    else if(!strcmp(a,"m32")){ uint32_t ad=strtoul(b,0,16); printf("%s %08x\n",b,core->busRead32(core,ad)); }
    else if(!strcmp(a,"poke8")){ core->busWrite8(core,strtoul(b,0,16),strtoul(c,0,16)); }
    else if(!strcmp(a,"poke16")){ core->busWrite16(core,strtoul(b,0,16),strtoul(c,0,16)); }
    else if(!strcmp(a,"dumpsav")){ void* sram; size_t sz=core->savedataClone(core,&sram); FILE*f=fopen(b,"wb"); fwrite(sram,1,sz,f); fclose(f); free(sram); printf("sav %zu\n",sz);} 
    else if(!strcmp(a,"ss")){ struct VFile* vf=VFileOpen(b,O_CREAT|O_TRUNC|O_RDWR); mCoreSaveStateNamed(core,vf,SAVESTATE_SAVEDATA); vf->close(vf);} 
    else if(!strcmp(a,"ls")){ struct VFile* vf=VFileOpen(b,O_RDONLY); mCoreLoadStateNamed(core,vf,SAVESTATE_SAVEDATA); vf->close(vf);} 
    tok=strtok_r(NULL,";",&save);} 
  core->deinit(core); return 0; }
