import asyncio
import base64
import os
from dotenv import load_dotenv
from ai_core.equipment_generator import MeshyClient

async def main():
    # Load the environment variables to get MESHY_API_KEY
    load_dotenv()
    
    api_key = os.getenv("MESHY_API_KEY")
    if not api_key:
        print("Error: MESHY_API_KEY is not set in .env")
        return

    # Image file path provided by user
    image_path = "/Users/you/code/plaresAR/img/mushl.png"
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return

    print("Loading image...")
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    data_uri = f"data:image/png;base64,{image_base64}"

    print("Initializing MeshyClient...")
    client = MeshyClient(api_key=api_key)

    try:
        print("Sending request to Meshy (this may take up to 3 minutes)...")
        # Generate 3D model using the attachment type to get a GLB back
        glb_url = await client.generate(
            image_base64=data_uri,
            prompt="mushroom shield",
            craft_kind="attachment"
        )
        print("\n\033[92mSuccess!\033[0m")
        print("\033[1mGenerated GLB URL:\033[0m")
        print(glb_url)
    except Exception as e:
        print(f"\n\033[91mError during generation:\033[0m {e}")

if __name__ == "__main__":
    asyncio.run(main())
