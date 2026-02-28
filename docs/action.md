Clip 正規化一覧（元クリップ名 -> 使用名）

Idle|Alert|Boxing_Practice -> Idle
Walking|Casual_Walk -> Walking
Running|RunFast -> Running
BeHit_FlyUp|Arise -> Jump
Skill_01 -> Punch
Skill_03 -> Kick
Dead -> Death
Boom_Dance|All_Night_Dance -> Yes

State -> Animation 一覧
HOVERING -> Idle（移動中は Walking）
FLANKING_RIGHT -> Walking
EMERGENCY_EVADE -> Running(speed=1.35)
EVADE_TO_COVER -> Running
BASIC_ATTACK -> Punch(speed=1.08)（移動中は Running）
CASTING_SPECIAL -> Jump(loopOnce,speed=0.9)
SUPER_SAIYAN -> Jump(loopOnce,speed=0.9)
PUNCH -> Punch(loopOnce) / hit: 0.35-0.58, range 1.0, damage 10
KICK -> Kick(loopOnce) / hit: 0.4-0.66, range 1.1, damage 10
COMBO_PUNCH -> Punch(loopOnce,speed=1.35) / hit: 0.28-0.65, range 1.12, damage 12
DODGE_LEFT -> Running(loopOnce,speed=1.3)
DODGE_RIGHT -> Running(loopOnce,speed=1.3)
EVADE_BACK -> Running(loopOnce,speed=-1.1)
DAMAGE -> Jump(loopOnce,speed=1.4)
FAINT -> Death(loopOnce)
CELEBRATE -> Yes
TAUNT -> Yes(loopOnce,speed=1.1)
IDLE -> Idle
WALK -> Walking
RUN -> Running
SUPER_DASH -> Running(speed=2.0)
SHORYUKEN -> Jump(loopOnce,speed=1.2) / hit: 0.3-0.62, range 1.05, damage 12
TORNADO_PUNCH -> Punch(loopOnce,speed=1.85) / hit: 0.24-0.72, range 1.2, damage 14
BEAM_CHARGE -> Jump(loopOnce,speed=0.75)

HOVERING：ボクシング
FLANKING_RIGHT ：酔ったような感じでのそのそ歩く
EMERGENCY_EVADE ：早く走る
EVADE_TO_COVER ：走る
BASIC_ATTACK ：攻撃を受けた後にダメージが残っているような感じでゆっくり歩く
CASTING_SPECIAL ：普通に歩く
SUPER_SAIYAN -：普通に歩く
PUNCH ：攻撃を受けた後にダメージが残っているような感じでゆっくり歩く
KICK ：堂々と歩く
COMBO_PUNCH ：攻撃を受けた後にダメージが残っているような感じでゆっくり歩く
DODGE_LEFT ：早く走る
DODGE_RIGHT ：早く走る
EVADE_BACK ：早く走る
DAMAGE ：堂々と歩く
FAINT ：必殺技攻撃
CELEBRATE ：待機して周囲を見渡す
TAUNT 待機して周囲を見渡す

ANIM CHECKに下記の一覧話
IDLE ：ボクシング
WALK ：酔ったような感じでのそのそ歩く
RUN ：走る
SUPER_DASH ：早く走る
SHORYUKEN ：普通に歩く
TORNADO_PUNCH ：攻撃を受けた後にダメージが残っているような感じでゆっくり歩く
BEAM_CHARGE ：堂々と歩く
