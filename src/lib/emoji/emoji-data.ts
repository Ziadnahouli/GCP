export interface EmojiItem {
  char: string;
  name: string;
  shortcode: string;
  keywords: string[];
  category: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: EmojiItem[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: '😀',
    emojis: [
      { char: '😀', name: 'Grinning Face', shortcode: ':grinning:', keywords: ['smile', 'happy', 'face'], category: 'smileys' },
      { char: '😃', name: 'Grinning Face with Big Eyes', shortcode: ':smiley:', keywords: ['smile', 'happy', 'joy'], category: 'smileys' },
      { char: '😄', name: 'Grinning Face with Smiling Eyes', shortcode: ':smile:', keywords: ['smile', 'happy', 'laugh'], category: 'smileys' },
      { char: '😁', name: 'Beaming Face with Smiling Eyes', shortcode: ':grin:', keywords: ['grin', 'smile', 'happy'], category: 'smileys' },
      { char: '😆', name: 'Grinning Squinting Face', shortcode: ':laughing:', keywords: ['laugh', 'happy', 'satisfied'], category: 'smileys' },
      { char: '😅', name: 'Grinning Face with Sweat', shortcode: ':sweat_smile:', keywords: ['sweat', 'relief', 'nervous'], category: 'smileys' },
      { char: '😂', name: 'Face with Tears of Joy', shortcode: ':joy:', keywords: ['tears', 'laugh', 'crying', 'funny'], category: 'smileys' },
      { char: '🤣', name: 'Rolling on the Floor Laughing', shortcode: ':rofl:', keywords: ['laughing', 'lol', 'rofl'], category: 'smileys' },
      { char: '😊', name: 'Smiling Face with Smiling Eyes', shortcode: ':blush:', keywords: ['smile', 'blush', 'warm'], category: 'smileys' },
      { char: '😇', name: 'Smiling Face with Halo', shortcode: ':innocent:', keywords: ['angel', 'halo', 'innocent'], category: 'smileys' },
      { char: '🙂', name: 'Slightly Smiling Face', shortcode: ':slightly_smiling_face:', keywords: ['smile', 'subtle'], category: 'smileys' },
      { char: '😉', name: 'Winking Face', shortcode: ':wink:', keywords: ['wink', 'flirt', 'joke'], category: 'smileys' },
      { char: '😍', name: 'Smiling Face with Heart-Eyes', shortcode: ':heart_eyes:', keywords: ['love', 'crush', 'heart'], category: 'smileys' },
      { char: '🥰', name: 'Smiling Face with Hearts', shortcode: ':smiling_face_with_3_hearts:', keywords: ['love', 'crush', 'hearts', 'smi'], category: 'smileys' },
      { char: '😘', name: 'Face Blowing a Kiss', shortcode: ':kissing_heart:', keywords: ['kiss', 'flirt', 'love'], category: 'smileys' },
      { char: '😋', name: 'Face Savoring Food', shortcode: ':yum:', keywords: ['tasty', 'delicious', 'tongue'], category: 'smileys' },
      { char: '😛', name: 'Face with Tongue', shortcode: ':stuck_out_tongue:', keywords: ['tongue', 'playful', 'silly'], category: 'smileys' },
      { char: '😜', name: 'Winking Face with Tongue', shortcode: ':stuck_out_tongue_winking_eye:', keywords: ['wink', 'tongue', 'crazy'], category: 'smileys' },
      { char: '🤪', name: 'Zany Face', shortcode: ':zany_face:', keywords: ['crazy', 'wild', 'goofy'], category: 'smileys' },
      { char: '😎', name: 'Smiling Face with Sunglasses', shortcode: ':sunglasses:', keywords: ['cool', 'shades', 'sun'], category: 'smileys' },
      { char: '🤩', name: 'Star-Struck', shortcode: ':star_struck:', keywords: ['star', 'eyes', 'wow', 'excited'], category: 'smileys' },
      { char: '🥳', name: 'Partying Face', shortcode: ':partying_face:', keywords: ['party', 'celebrate', 'birthday'], category: 'smileys' },
      { char: '😏', name: 'Smirking Face', shortcode: ':smirk:', keywords: ['smirk', 'suggestive'], category: 'smileys' },
      { char: '😒', name: 'Unamused Face', shortcode: ':unamused:', keywords: ['meh', 'bored', 'annoyed'], category: 'smileys' },
      { char: '😞', name: 'Disappointed Face', shortcode: ':disappointed:', keywords: ['sad', 'down', 'depressed'], category: 'smileys' },
      { char: '😔', name: 'Pensive Face', shortcode: ':pensive:', keywords: ['thoughtful', 'sad', 'down'], category: 'smileys' },
      { char: '😟', name: 'Worried Face', shortcode: ':worried:', keywords: ['worry', 'concern', 'nervous'], category: 'smileys' },
      { char: '😕', name: 'Confused Face', shortcode: ':confused:', keywords: ['confused', 'puzzled', 'question'], category: 'smileys' },
      { char: '🙁', name: 'Slightly Frowning Face', shortcode: ':slightly_frowning_face:', keywords: ['sad', 'unhappy'], category: 'smileys' },
      { char: '😢', name: 'Crying Face', shortcode: ':cry:', keywords: ['tear', 'sad', 'upset'], category: 'smileys' },
      { char: '😭', name: 'Loudly Crying Face', shortcode: ':sob:', keywords: ['bawling', 'crying', 'tears', 'sad'], category: 'smileys' },
      { char: '😤', name: 'Face with Steam From Nose', shortcode: ':triumph:', keywords: ['steam', 'frustrated', 'pout'], category: 'smileys' },
      { char: '😠', name: 'Angry Face', shortcode: ':angry:', keywords: ['mad', 'annoyed', 'angry'], category: 'smileys' },
      { char: '😡', name: 'Pouting Face', shortcode: ':rage:', keywords: ['furious', 'red', 'angry'], category: 'smileys' },
      { char: '🤬', name: 'Face with Symbols on Mouth', shortcode: ':cursing_face:', keywords: ['swear', 'cuss', 'mad'], category: 'smileys' },
      { char: '🤯', name: 'Exploding Head', shortcode: ':exploding_head:', keywords: ['mindblown', 'shock', 'boom'], category: 'smileys' },
      { char: '😳', name: 'Flushed Face', shortcode: ':flushed:', keywords: ['embarrassed', 'shock', 'blush'], category: 'smileys' },
      { char: '🥵', name: 'Hot Face', shortcode: ':hot_face:', keywords: ['sweat', 'fever', 'summer', 'heat'], category: 'smileys' },
      { char: '🥶', name: 'Cold Face', shortcode: ':cold_face:', keywords: ['ice', 'freezing', 'winter'], category: 'smileys' },
      { char: '😱', name: 'Face Screaming in Fear', shortcode: ':scream:', keywords: ['shocked', 'munch', 'scared'], category: 'smileys' },
      { char: '😨', name: 'Fearful Face', shortcode: ':fearful:', keywords: ['scared', 'worried', 'nervous'], category: 'smileys' },
      { char: '😰', name: 'Anxious Face with Sweat', shortcode: ':cold_sweat:', keywords: ['sweat', 'nervous', 'anxious'], category: 'smileys' },
      { char: '😥', name: 'Sad but Relieved Face', shortcode: ':disappointed_relieved:', keywords: ['relief', 'whew'], category: 'smileys' },
      { char: '🤤', name: 'Drooling Face', shortcode: ':drooling_face:', keywords: ['drool', 'craving'], category: 'smileys' },
      { char: '😴', name: 'Sleeping Face', shortcode: ':sleeping:', keywords: ['sleep', 'zzz', 'tired'], category: 'smileys' },
      { char: '😷', name: 'Face with Medical Mask', shortcode: ':mask:', keywords: ['sick', 'mask', 'covid'], category: 'smileys' },
      { char: '🤒', name: 'Face with Thermometer', shortcode: ':thermometer_face:', keywords: ['sick', 'ill', 'fever'], category: 'smileys' },
      { char: '🤢', name: 'Nauseated Face', shortcode: ':nauseated_face:', keywords: ['gross', 'green', 'sick'], category: 'smileys' },
      { char: '🤮', name: 'Face Vomiting', shortcode: ':vomiting_face:', keywords: ['puke', 'vomit', 'sick'], category: 'smileys' },
      { char: '🤧', name: 'Sneezing Face', shortcode: ':sneezing_face:', keywords: ['sneeze', 'flu', 'tissue'], category: 'smileys' },
      { char: '🤠', name: 'Cowboy Hat Face', shortcode: ':cowboy_hat_face:', keywords: ['cowboy', 'western'], category: 'smileys' },
      { char: '🥸', name: 'Disguised Face', shortcode: ':disguised_face:', keywords: ['glasses', 'disguise', 'incognito'], category: 'smileys' },
      { char: '🤐', name: 'Zipper-Mouth Face', shortcode: ':zipper_mouth_face:', keywords: ['secret', 'quiet', 'hush'], category: 'smileys' },
      { char: '🤨', name: 'Face with Raised Eyebrow', shortcode: ':raised_eyebrow:', keywords: ['skeptical', 'doubt', 'rock'], category: 'smileys' },
      { char: '😐', name: 'Neutral Face', shortcode: ':neutral_face:', keywords: ['meh', 'indifferent', 'neutral'], category: 'smileys' },
      { char: '😑', name: 'Expressionless Face', shortcode: ':expressionless:', keywords: ['blank', 'unimpressed'], category: 'smileys' },
      { char: '😶', name: 'Face Without Mouth', shortcode: ':no_mouth:', keywords: ['mute', 'silence', 'speechless'], category: 'smileys' },
      { char: '🙄', name: 'Face with Rolling Eyes', shortcode: ':roll_eyes:', keywords: ['eyeroll', 'whatever', 'frustrated'], category: 'smileys' },
      { char: '😬', name: 'Grimacing Face', shortcode: ':grimacing:', keywords: ['grimace', 'awkward', 'cringe'], category: 'smileys' },
      { char: '🤥', name: 'Lying Face', shortcode: ':lying_face:', keywords: ['pinocchio', 'lie'], category: 'smileys' },
      { char: '🤫', name: 'Shushing Face', shortcode: ':shushing_face:', keywords: ['shh', 'quiet', 'secret'], category: 'smileys' },
      { char: '🤭', name: 'Face with Hand Over Mouth', shortcode: ':hand_over_mouth:', keywords: ['oops', 'giggle', 'secret'], category: 'smileys' },
      { char: '🧐', name: 'Face with Monocle', shortcode: ':monocle_face:', keywords: ['classy', 'thinking', 'inspect'], category: 'smileys' },
      { char: '🤓', name: 'Nerd Face', shortcode: ':nerd_face:', keywords: ['nerd', 'geek', 'smart', 'glasses'], category: 'smileys' },
      { char: '💀', name: 'Skull', shortcode: ':skull:', keywords: ['dead', 'dying', 'skeleton', 'funny'], category: 'smileys' },
      { char: '☠️', name: 'Skull and Crossbones', shortcode: ':skull_crossbones:', keywords: ['danger', 'pirate', 'dead'], category: 'smileys' },
      { char: '💩', name: 'Pile of Poo', shortcode: ':poop:', keywords: ['poop', 'crap', 'shit'], category: 'smileys' },
      { char: '🤡', name: 'Clown Face', shortcode: ':clown_face:', keywords: ['clown', 'joke', 'circus', 'fool'], category: 'smileys' },
      { char: '👻', name: 'Ghost', shortcode: ':ghost:', keywords: ['spooky', 'halloween', 'boo'], category: 'smileys' },
      { char: '👽', name: 'Alien', shortcode: ':alien:', keywords: ['ufo', 'extraterrestrial', 'sci-fi'], category: 'smileys' },
      { char: '🤖', name: 'Robot', shortcode: ':robot:', keywords: ['bot', 'droid', 'machine', 'ai'], category: 'smileys' },
    ],
  },
  {
    id: 'people',
    name: 'People & Body',
    icon: '👋',
    emojis: [
      { char: '👋', name: 'Waving Hand', shortcode: ':wave:', keywords: ['wave', 'hello', 'bye', 'hi'], category: 'people' },
      { char: '🤚', name: 'Raised Back of Hand', shortcode: ':raised_back_of_hand:', keywords: ['backhand', 'stop'], category: 'people' },
      { char: '🖐️', name: 'Hand with Fingers Splayed', shortcode: ':raised_hand_with_fingers_splayed:', keywords: ['hand', 'five'], category: 'people' },
      { char: '✋', name: 'Raised Hand', shortcode: ':raised_hand:', keywords: ['high five', 'stop'], category: 'people' },
      { char: '🖖', name: 'Vulcan Salute', shortcode: ':vulcan_salute:', keywords: ['spock', 'star trek'], category: 'people' },
      { char: '👌', name: 'OK Hand', shortcode: ':ok_hand:', keywords: ['ok', 'perfect', 'fine'], category: 'people' },
      { char: '🤌', name: 'Pinched Fingers', shortcode: ':pinched_fingers:', keywords: ['italian', 'gesture', 'what'], category: 'people' },
      { char: '🤏', name: 'Pinching Hand', shortcode: ':pinching_hand:', keywords: ['small', 'tiny', 'little'], category: 'people' },
      { char: '✌️', name: 'Victory Hand', shortcode: ':v:', keywords: ['peace', 'victory', 'two'], category: 'people' },
      { char: '🤞', name: 'Crossed Fingers', shortcode: ':crossed_fingers:', keywords: ['luck', 'hope', 'wish'], category: 'people' },
      { char: '🤟', name: 'Love-You Gesture', shortcode: ':love_you_gesture:', keywords: ['ily', 'love', 'hand'], category: 'people' },
      { char: '🤘', name: 'Sign of the Horns', shortcode: ':metal:', keywords: ['rock', 'horns', 'heavy metal'], category: 'people' },
      { char: '🤙', name: 'Call Me Hand', shortcode: ':call_me_hand:', keywords: ['shaka', 'hang loose', 'call'], category: 'people' },
      { char: '👈', name: 'Backhand Index Pointing Left', shortcode: ':point_left:', keywords: ['left', 'finger'], category: 'people' },
      { char: '👉', name: 'Backhand Index Pointing Right', shortcode: ':point_right:', keywords: ['right', 'finger'], category: 'people' },
      { char: '👆', name: 'Backhand Index Pointing Up', shortcode: ':point_up_2:', keywords: ['up', 'this'], category: 'people' },
      { char: '👇', name: 'Backhand Index Pointing Down', shortcode: ':point_down:', keywords: ['down', 'look'], category: 'people' },
      { char: '☝️', name: 'Index Pointing Up', shortcode: ':point_up:', keywords: ['one', 'first', 'up'], category: 'people' },
      { char: '👍', name: 'Thumbs Up', shortcode: ':thumbsup:', keywords: ['thumbs', 'up', 'approve', 'like', 'good', 'yes'], category: 'people' },
      { char: '👎', name: 'Thumbs Down', shortcode: ':thumbsdown:', keywords: ['thumbs', 'down', 'dislike', 'no', 'bad'], category: 'people' },
      { char: '✊', name: 'Raised Fist', shortcode: ':fist:', keywords: ['punch', 'power', 'solidarity'], category: 'people' },
      { char: '👊', name: 'Oncoming Fist', shortcode: ':facepunch:', keywords: ['fist bump', 'brofist'], category: 'people' },
      { char: '🤛', name: 'Left-Facing Fist', shortcode: ':fist_left:', keywords: ['bump', 'fist'], category: 'people' },
      { char: '🤜', name: 'Right-Facing Fist', shortcode: ':fist_right:', keywords: ['bump', 'fist'], category: 'people' },
      { char: '👏', name: 'Clapping Hands', shortcode: ':clap:', keywords: ['applause', 'praise', 'bravo'], category: 'people' },
      { char: '🙌', name: 'Raising Hands', shortcode: ':raised_hands:', keywords: ['celebrate', 'hooray', 'yay'], category: 'people' },
      { char: '👐', name: 'Open Hands', shortcode: ':open_hands:', keywords: ['hug', 'open'], category: 'people' },
      { char: '🤲', name: 'Palms Up Together', shortcode: ':palms_up_together:', keywords: ['prayer', 'cupped'], category: 'people' },
      { char: '🤝', name: 'Handshake', shortcode: ':handshake:', keywords: ['deal', 'agreement', 'shake'], category: 'people' },
      { char: '🙏', name: 'Folded Hands', shortcode: ':pray:', keywords: ['please', 'thanks', 'pray', 'namaste'], category: 'people' },
      { char: '✍️', name: 'Writing Hand', shortcode: ':writing_hand:', keywords: ['write', 'author', 'pen'], category: 'people' },
      { char: '💅', name: 'Nail Polish', shortcode: ':nail_care:', keywords: ['slay', 'manicure', 'sassy'], category: 'people' },
      { char: '🤳', name: 'Selfie', shortcode: ':selfie:', keywords: ['camera', 'phone', 'selfie'], category: 'people' },
      { char: '💪', name: 'Flexed Biceps', shortcode: ':muscle:', keywords: ['strong', 'flex', 'gym', 'workout'], category: 'people' },
      { char: '👀', name: 'Eyes', shortcode: ':eyes:', keywords: ['look', 'see', 'watch', 'peek'], category: 'people' },
      { char: '👁️', name: 'Eye', shortcode: ':eye:', keywords: ['look', 'vision'], category: 'people' },
      { char: '🧠', name: 'Brain', shortcode: ':brain:', keywords: ['mind', 'smart', 'intellect'], category: 'people' },
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      { char: '🐶', name: 'Dog Face', shortcode: ':dog:', keywords: ['pet', 'puppy', 'bark', 'doggo'], category: 'animals' },
      { char: '🐱', name: 'Cat Face', shortcode: ':cat:', keywords: ['pet', 'kitten', 'meow', 'kitty'], category: 'animals' },
      { char: '🐭', name: 'Mouse Face', shortcode: ':mouse:', keywords: ['rodent', 'cheese'], category: 'animals' },
      { char: '🐹', name: 'Hamster', shortcode: ':hamster:', keywords: ['pet', 'cute', 'rodent'], category: 'animals' },
      { char: '🐰', name: 'Rabbit Face', shortcode: ':rabbit:', keywords: ['bunny', 'pet', 'easter'], category: 'animals' },
      { char: '🦊', name: 'Fox', shortcode: ':fox_face:', keywords: ['clever', 'wild', 'forest'], category: 'animals' },
      { char: '🐻', name: 'Bear', shortcode: ':bear:', keywords: ['grizzly', 'wild'], category: 'animals' },
      { char: '🐼', name: 'Panda', shortcode: ':panda_face:', keywords: ['bamboo', 'bear', 'cute'], category: 'animals' },
      { char: '🐨', name: 'Koala', shortcode: ':koala:', keywords: ['australia', 'eucalyptus'], category: 'animals' },
      { char: '🐯', name: 'Tiger Face', shortcode: ':tiger:', keywords: ['stripes', 'cat', 'wild'], category: 'animals' },
      { char: '🦁', name: 'Lion', shortcode: ':lion:', keywords: ['king', 'mane', 'safari'], category: 'animals' },
      { char: '🐮', name: 'Cow Face', shortcode: ':cow:', keywords: ['moo', 'milk', 'farm'], category: 'animals' },
      { char: '🐷', name: 'Pig Face', shortcode: ':pig:', keywords: ['oink', 'farm'], category: 'animals' },
      { char: '🐸', name: 'Frog', shortcode: ':frog:', keywords: ['amphibian', 'croak', 'green', 'pepe'], category: 'animals' },
      { char: '🐵', name: 'Monkey Face', shortcode: ':monkey_face:', keywords: ['chimp', 'ape'], category: 'animals' },
      { char: '🐔', name: 'Chicken', shortcode: ':chicken:', keywords: ['farm', 'bird', 'poultry'], category: 'animals' },
      { char: '🐧', name: 'Penguin', shortcode: ':penguin:', keywords: ['antarctica', 'bird', 'ice'], category: 'animals' },
      { char: '🐦', name: 'Bird', shortcode: ':bird:', keywords: ['fly', 'tweet'], category: 'animals' },
      { char: '🦆', name: 'Duck', shortcode: ':duck:', keywords: ['quack', 'pond'], category: 'animals' },
      { char: '🦅', name: 'Eagle', shortcode: ':eagle:', keywords: ['america', 'bird', 'freedom'], category: 'animals' },
      { char: '🦉', name: 'Owl', shortcode: ':owl:', keywords: ['wise', 'night', 'hoot'], category: 'animals' },
      { char: '🦇', name: 'Bat', shortcode: ':bat:', keywords: ['vampire', 'spooky', 'night'], category: 'animals' },
      { char: '🐺', name: 'Wolf', shortcode: ':wolf:', keywords: ['howl', 'wild'], category: 'animals' },
      { char: '🦄', name: 'Unicorn', shortcode: ':unicorn:', keywords: ['magic', 'fantasy', 'rainbow'], category: 'animals' },
      { char: '🐝', name: 'Honeybee', shortcode: ':bee:', keywords: ['honey', 'insect', 'buzz'], category: 'animals' },
      { char: '🐛', name: 'Bug', shortcode: ':bug:', keywords: ['insect', 'caterpillar', 'code'], category: 'animals' },
      { char: '🦋', name: 'Butterfly', shortcode: ':butterfly:', keywords: ['pretty', 'insect', 'wings'], category: 'animals' },
      { char: '🐌', name: 'Snail', shortcode: ':snail:', keywords: ['slow', 'shell'], category: 'animals' },
      { char: '🌸', name: 'Cherry Blossom', shortcode: ':cherry_blossom:', keywords: ['flower', 'spring', 'sakura'], category: 'animals' },
      { char: '🌹', name: 'Rose', shortcode: ':rose:', keywords: ['flower', 'romance', 'love'], category: 'animals' },
      { char: '🌺', name: 'Hibiscus', shortcode: ':hibiscus:', keywords: ['flower', 'tropical'], category: 'animals' },
      { char: '🌻', name: 'Sunflower', shortcode: ':sunflower:', keywords: ['flower', 'sun', 'yellow'], category: 'animals' },
      { char: '🌲', name: 'Evergreen Tree', shortcode: ':evergreen_tree:', keywords: ['tree', 'forest', 'nature'], category: 'animals' },
      { char: '🌴', name: 'Palm Tree', shortcode: ':palm_tree:', keywords: ['beach', 'tropical', 'vacation'], category: 'animals' },
      { char: '🌱', name: 'Seedling', shortcode: ':seedling:', keywords: ['grow', 'plant', 'nature'], category: 'animals' },
      { char: '🍀', name: 'Four Leaf Clover', shortcode: ':four_leaf_clover:', keywords: ['luck', 'green', 'irish'], category: 'animals' },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '🍕',
    emojis: [
      { char: '🍎', name: 'Red Apple', shortcode: ':apple:', keywords: ['fruit', 'healthy'], category: 'food' },
      { char: '🍌', name: 'Banana', shortcode: ':banana:', keywords: ['fruit', 'yellow'], category: 'food' },
      { char: '🍉', name: 'Watermelon', shortcode: ':watermelon:', keywords: ['fruit', 'summer', 'melon'], category: 'food' },
      { char: '🍇', name: 'Grapes', shortcode: ':grapes:', keywords: ['fruit', 'wine'], category: 'food' },
      { char: '🍓', name: 'Strawberry', shortcode: ':strawberry:', keywords: ['berry', 'sweet'], category: 'food' },
      { char: '🥑', name: 'Avocado', shortcode: ':avocado:', keywords: ['guacamole', 'healthy'], category: 'food' },
      { char: '🍔', name: 'Hamburger', shortcode: ':hamburger:', keywords: ['burger', 'fast food', 'beef'], category: 'food' },
      { char: '🍟', name: 'French Fries', shortcode: ':fries:', keywords: ['chips', 'fast food', 'potato'], category: 'food' },
      { char: '🍕', name: 'Pizza', shortcode: ':pizza:', keywords: ['cheese', 'slice', 'italian'], category: 'food' },
      { char: '🌭', name: 'Hot Dog', shortcode: ':hotdog:', keywords: ['sausage', 'frankfurter'], category: 'food' },
      { char: '🥪', name: 'Sandwich', shortcode: ':sandwich:', keywords: ['bread', 'lunch'], category: 'food' },
      { char: '🌮', name: 'Taco', shortcode: ':taco:', keywords: ['mexican', 'food'], category: 'food' },
      { char: '🌯', name: 'Burrito', shortcode: ':burrito:', keywords: ['mexican', 'wrap'], category: 'food' },
      { char: '🍜', name: 'Steaming Bowl', shortcode: ':ramen:', keywords: ['ramen', 'noodles', 'soup'], category: 'food' },
      { char: '🍝', name: 'Spaghetti', shortcode: ':spaghetti:', keywords: ['pasta', 'italian'], category: 'food' },
      { char: '🍣', name: 'Sushi', shortcode: ':sushi:', keywords: ['japanese', 'fish', 'rice'], category: 'food' },
      { char: '🍦', name: 'Soft Ice Cream', shortcode: ':icecream:', keywords: ['dessert', 'vanilla'], category: 'food' },
      { char: '🍩', name: 'Doughnut', shortcode: ':doughnut:', keywords: ['donut', 'sweet', 'pastry'], category: 'food' },
      { char: '🍪', name: 'Cookie', shortcode: ':cookie:', keywords: ['chocolate chip', 'biscuit'], category: 'food' },
      { char: '🎂', name: 'Birthday Cake', shortcode: ':birthday:', keywords: ['cake', 'celebrate'], category: 'food' },
      { char: '🍫', name: 'Chocolate Bar', shortcode: ':chocolate_bar:', keywords: ['candy', 'sweet'], category: 'food' },
      { char: '🍿', name: 'Popcorn', shortcode: ':popcorn:', keywords: ['movie', 'snack', 'cinema'], category: 'food' },
      { char: '☕', name: 'Hot Beverage', shortcode: ':coffee:', keywords: ['coffee', 'tea', 'caffeine', 'espresso'], category: 'food' },
      { char: '🍵', name: 'Teacup Without Handle', shortcode: ':tea:', keywords: ['green tea', 'matcha'], category: 'food' },
      { char: '🧃', name: 'Beverage Box', shortcode: ':beverage_box:', keywords: ['juice', 'box'], category: 'food' },
      { char: '🍺', name: 'Beer Mug', shortcode: ':beer:', keywords: ['drink', 'alcohol', 'brew'], category: 'food' },
      { char: '🍻', name: 'Clinking Beer Mugs', shortcode: ':beers:', keywords: ['cheers', 'toast', 'drink'], category: 'food' },
      { char: '🍷', name: 'Wine Glass', shortcode: ':wine_glass:', keywords: ['red wine', 'alcohol'], category: 'food' },
      { char: '🍸', name: 'Cocktail Glass', shortcode: ':cocktail:', keywords: ['martini', 'drink'], category: 'food' },
      { char: '🧋', name: 'Bubble Tea', shortcode: ':boba:', keywords: ['boba', 'pearls', 'milk tea'], category: 'food' },
    ],
  },
  {
    id: 'activities',
    name: 'Activities',
    icon: '⚽',
    emojis: [
      { char: '⚽', name: 'Soccer Ball', shortcode: ':soccer:', keywords: ['football', 'sport'], category: 'activities' },
      { char: '🏀', name: 'Basketball', shortcode: ':basketball:', keywords: ['hoop', 'nba', 'sport'], category: 'activities' },
      { char: '🏈', name: 'American Football', shortcode: ':football:', keywords: ['nfl', 'sport'], category: 'activities' },
      { char: '⚾', name: 'Baseball', shortcode: ':baseball:', keywords: ['mlb', 'sport'], category: 'activities' },
      { char: '🎾', name: 'Tennis', shortcode: ':tennis:', keywords: ['racket', 'wimbledon'], category: 'activities' },
      { char: '🏐', name: 'Volleyball', shortcode: ':volleyball:', keywords: ['sport', 'beach'], category: 'activities' },
      { char: '🎱', name: 'Pool 8 Ball', shortcode: ':8ball:', keywords: ['billiards', 'pool', 'game'], category: 'activities' },
      { char: '🏓', name: 'Ping Pong', shortcode: ':ping_pong:', keywords: ['table tennis'], category: 'activities' },
      { char: '🎯', name: 'Bullseye', shortcode: ':dart:', keywords: ['target', 'direct hit', 'focus', 'accuracy'], category: 'activities' },
      { char: '🎮', name: 'Video Game', shortcode: ':video_game:', keywords: ['controller', 'playstation', 'xbox', 'gaming', 'gamer'], category: 'activities' },
      { char: '🕹️', name: 'Joystick', shortcode: ':joystick:', keywords: ['arcade', 'game', 'retro'], category: 'activities' },
      { char: '🎲', name: 'Game Die', shortcode: ':game_die:', keywords: ['dice', 'roll', 'random', 'board game'], category: 'activities' },
      { char: '🎨', name: 'Artist Palette', shortcode: ':art:', keywords: ['paint', 'art', 'draw', 'creative'], category: 'activities' },
      { char: '🎬', name: 'Clapper Board', shortcode: ':clapper:', keywords: ['movie', 'film', 'cinema'], category: 'activities' },
      { char: '🎤', name: 'Microphone', shortcode: ':microphone:', keywords: ['sing', 'karaoke', 'voice'], category: 'activities' },
      { char: '🎧', name: 'Headphone', shortcode: ':headphones:', keywords: ['music', 'listen', 'audio'], category: 'activities' },
      { char: '🏆', name: 'Trophy', shortcode: ':trophy:', keywords: ['win', 'award', 'first', 'champion'], category: 'activities' },
      { char: '🥇', name: '1st Place Medal', shortcode: ':first_place_medal:', keywords: ['gold', 'winner'], category: 'activities' },
      { char: '🥈', name: '2nd Place Medal', shortcode: ':second_place_medal:', keywords: ['silver'], category: 'activities' },
      { char: '🥉', name: '3rd Place Medal', shortcode: ':third_place_medal:', keywords: ['bronze'], category: 'activities' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: '✈️',
    emojis: [
      { char: '🚗', name: 'Automobile', shortcode: ':car:', keywords: ['vehicle', 'drive', 'auto'], category: 'travel' },
      { char: '🏎️', name: 'Racing Car', shortcode: ':racing_car:', keywords: ['f1', 'speed', 'race'], category: 'travel' },
      { char: '🚀', name: 'Rocket', shortcode: ':rocket:', keywords: ['space', 'launch', 'fast', 'blastoff'], category: 'travel' },
      { char: '✈️', name: 'Airplane', shortcode: ':airplane:', keywords: ['flight', 'fly', 'travel'], category: 'travel' },
      { char: '🚁', name: 'Helicopter', shortcode: ':helicopter:', keywords: ['copter', 'fly'], category: 'travel' },
      { char: '⛵', name: 'Sailboat', shortcode: ':sailboat:', keywords: ['boat', 'sea', 'ocean'], category: 'travel' },
      { char: '🛸', name: 'Flying Saucer', shortcode: ':flying_saucer:', keywords: ['ufo', 'alien', 'sci-fi'], category: 'travel' },
      { char: '🌍', name: 'Globe Europe-Africa', shortcode: ':earth_africa:', keywords: ['world', 'earth', 'planet'], category: 'travel' },
      { char: '🗽', name: 'Statue of Liberty', shortcode: ':statue_of_liberty:', keywords: ['new york', 'usa'], category: 'travel' },
      { char: '🗼', name: 'Tokyo Tower', shortcode: ':tokyo_tower:', keywords: ['japan', 'tower'], category: 'travel' },
      { char: '🏰', name: 'Castle', shortcode: ':castle:', keywords: ['kingdom', 'medieval'], category: 'travel' },
      { char: '⛺', name: 'Tent', shortcode: ':tent:', keywords: ['camping', 'outdoors'], category: 'travel' },
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: '💡',
    emojis: [
      { char: '💡', name: 'Light Bulb', shortcode: ':bulb:', keywords: ['idea', 'light', 'bright'], category: 'objects' },
      { char: '💻', name: 'Laptop', shortcode: ':laptop:', keywords: ['computer', 'pc', 'tech', 'code'], category: 'objects' },
      { char: '📱', name: 'Mobile Phone', shortcode: ':iphone:', keywords: ['phone', 'cell', 'smartphone'], category: 'objects' },
      { char: '⌨️', name: 'Keyboard', shortcode: ':keyboard:', keywords: ['type', 'computer', 'input'], category: 'objects' },
      { char: '🖥️', name: 'Desktop Computer', shortcode: ':desktop_computer:', keywords: ['screen', 'monitor'], category: 'objects' },
      { char: '⌚', name: 'Watch', shortcode: ':watch:', keywords: ['time', 'clock'], category: 'objects' },
      { char: '⏰', name: 'Alarm Clock', shortcode: ':alarm_clock:', keywords: ['time', 'wake', 'morning'], category: 'objects' },
      { char: '⏱️', name: 'Stopwatch', shortcode: ':stopwatch:', keywords: ['timer', 'measure'], category: 'objects' },
      { char: '🔑', name: 'Key', shortcode: ':key:', keywords: ['lock', 'password', 'door'], category: 'objects' },
      { char: '🔒', name: 'Locked', shortcode: ':lock:', keywords: ['secure', 'privacy', 'secret'], category: 'objects' },
      { char: '🔓', name: 'Unlocked', shortcode: ':unlock:', keywords: ['open', 'insecure'], category: 'objects' },
      { char: '📦', name: 'Package', shortcode: ':package:', keywords: ['box', 'parcel', 'shipping'], category: 'objects' },
      { char: '💎', name: 'Gem Stone', shortcode: ':gem:', keywords: ['diamond', 'jewelry', 'precious'], category: 'objects' },
      { char: '💰', name: 'Money Bag', shortcode: ':moneybag:', keywords: ['cash', 'rich', 'dollar'], category: 'objects' },
      { char: '💳', name: 'Credit Card', shortcode: ':credit_card:', keywords: ['payment', 'bank'], category: 'objects' },
      { char: '🔔', name: 'Bell', shortcode: ':bell:', keywords: ['notification', 'alert', 'ring'], category: 'objects' },
      { char: '📢', name: 'Loudspeaker', shortcode: ':loudspeaker:', keywords: ['announcement', 'megaphone'], category: 'objects' },
      { char: '🎁', name: 'Wrapped Gift', shortcode: ':gift:', keywords: ['present', 'birthday', 'holiday'], category: 'objects' },
      { char: '📸', name: 'Camera', shortcode: ':camera:', keywords: ['photo', 'picture', 'snap'], category: 'objects' },
      { char: '🔍', name: 'Magnifying Glass Tilted Left', shortcode: ':mag:', keywords: ['search', 'find', 'look'], category: 'objects' },
      { char: '🔥', name: 'Fire', shortcode: ':fire:', keywords: ['flame', 'lit', 'hot', 'burn', 'awesome'], category: 'objects' },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: '❤️',
    emojis: [
      { char: '❤️', name: 'Red Heart', shortcode: ':heart:', keywords: ['love', 'like', 'valentine'], category: 'symbols' },
      { char: '🧡', name: 'Orange Heart', shortcode: ':orange_heart:', keywords: ['love', 'orange'], category: 'symbols' },
      { char: '💛', name: 'Yellow Heart', shortcode: ':yellow_heart:', keywords: ['love', 'yellow', 'friendship'], category: 'symbols' },
      { char: '💚', name: 'Green Heart', shortcode: ':green_heart:', keywords: ['love', 'green'], category: 'symbols' },
      { char: '💙', name: 'Blue Heart', shortcode: ':blue_heart:', keywords: ['love', 'blue'], category: 'symbols' },
      { char: '💜', name: 'Purple Heart', shortcode: ':purple_heart:', keywords: ['love', 'purple'], category: 'symbols' },
      { char: '🖤', name: 'Black Heart', shortcode: ':black_heart:', keywords: ['love', 'black', 'dark'], category: 'symbols' },
      { char: '🤍', name: 'White Heart', shortcode: ':white_heart:', keywords: ['love', 'white', 'pure'], category: 'symbols' },
      { char: '💔', name: 'Broken Heart', shortcode: ':broken_heart:', keywords: ['heartbreak', 'sad'], category: 'symbols' },
      { char: '✨', name: 'Sparkles', shortcode: ':sparkles:', keywords: ['shiny', 'magic', 'clean', 'new', 'star'], category: 'symbols' },
      { char: '⭐', name: 'Star', shortcode: ':star:', keywords: ['favorite', 'rate', 'gold'], category: 'symbols' },
      { char: '🌟', name: 'Glowing Star', shortcode: ':glowing_star:', keywords: ['shine', 'bright'], category: 'symbols' },
      { char: '💥', name: 'Collision', shortcode: ':boom:', keywords: ['explosion', 'bang'], category: 'symbols' },
      { char: '💯', name: 'Hundred Points', shortcode: ':100:', keywords: ['score', 'perfect', 'keep it 100'], category: 'symbols' },
      { char: '✅', name: 'Check Mark Button', shortcode: ':white_check_mark:', keywords: ['done', 'yes', 'correct', 'ok'], category: 'symbols' },
      { char: '❌', name: 'Cross Mark', shortcode: ':x:', keywords: ['no', 'delete', 'wrong', 'cancel'], category: 'symbols' },
      { char: '⚡', name: 'High Voltage', shortcode: ':zap:', keywords: ['lightning', 'fast', 'energy', 'thunder'], category: 'symbols' },
      { char: '⚠️', name: 'Warning', shortcode: ':warning:', keywords: ['alert', 'caution', 'danger'], category: 'symbols' },
      { char: '🚫', name: 'Prohibited', shortcode: ':no_entry_sign:', keywords: ['forbidden', 'stop', 'no'], category: 'symbols' },
      { char: '❓', name: 'Question Mark', shortcode: ':question:', keywords: ['what', 'confused', 'help'], category: 'symbols' },
      { char: '❗', name: 'Exclamation Mark', shortcode: ':exclamation:', keywords: ['important', 'alert'], category: 'symbols' },
    ],
  },
];

// Flat index of all emojis for fast lookup
export const ALL_EMOJIS: EmojiItem[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

// Emoji mapping by char and shortcode
export const EMOJI_BY_CHAR = new Map<string, EmojiItem>(ALL_EMOJIS.map((e) => [e.char, e]));
export const EMOJI_BY_SHORTCODE = new Map<string, EmojiItem>(ALL_EMOJIS.map((e) => [e.shortcode, e]));

/**
 * Search emojis by keyword, name, or shortcode
 */
export function searchEmojis(query: string): EmojiItem[] {
  const q = query.trim().toLowerCase().replace(/^:/, '').replace(/:$/, '');
  if (!q) return ALL_EMOJIS;

  return ALL_EMOJIS.filter((emoji) => {
    if (emoji.name.toLowerCase().includes(q)) return true;
    if (emoji.shortcode.toLowerCase().includes(q)) return true;
    return emoji.keywords.some((k) => k.toLowerCase().includes(q));
  });
}

/**
 * Autocomplete shortcode matches (e.g. "smi" -> :smile:, :smiley:, etc.)
 */
export function findShortcodeMatches(prefix: string, maxResults = 8): EmojiItem[] {
  const p = prefix.trim().toLowerCase().replace(/^:/, '');
  if (!p) return [];

  const matches = ALL_EMOJIS.filter((emoji) => {
    const rawCode = emoji.shortcode.replace(/:/g, '');
    return rawCode.startsWith(p) || rawCode.includes(p);
  });

  return matches.slice(0, maxResults);
}

/**
 * Detect if text is 1-3 emojis and nothing else (for enlarged chat bubble display)
 */
export function isEmojiOnlyMessage(text: string): { isEmojiOnly: boolean; count: number } {
  const trimmed = text.trim();
  if (!trimmed) return { isEmojiOnly: false, count: 0 };

  // Use Intl.Segmenter if available or Unicode emoji regex
  // Regex to match emojis including modifiers, zwj sequences, and flags
  const emojiRegex = new RegExp(
    '^(?:(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)(?:\\u200D(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F))*|\\s)+$',
    'u'
  );

  if (!emojiRegex.test(trimmed)) {
    return { isEmojiOnly: false, count: 0 };
  }

  // Count individual emoji graphemes (excluding spaces)
  let count = 0;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(trimmed));
    for (const seg of segments) {
      if (seg.segment.trim().length > 0) {
        count++;
      }
    }
  } else {
    // Fallback: match emoji tokens
    const singleEmojiRegex = new RegExp(
      '(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)(?:\\u200D(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F))*',
      'gu'
    );
    const matches = trimmed.match(singleEmojiRegex) || [];
    count = matches.length;
  }

  const isEmojiOnly = count >= 1 && count <= 3;
  return { isEmojiOnly, count };
}

const RECENT_EMOJIS_KEY = 'nexus_recent_emojis_v1';
const MAX_RECENTS = 24;

/**
 * Get recent emojis from localStorage
 */
export function getRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save recent emoji to localStorage with LRU order
 */
export function saveRecentEmoji(char: string): void {
  if (typeof window === 'undefined' || !char) return;
  try {
    const current = getRecentEmojis().filter((e) => e !== char);
    current.unshift(char);
    if (current.length > MAX_RECENTS) {
      current.length = MAX_RECENTS;
    }
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(current));
  } catch {}
}
